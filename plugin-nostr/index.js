// Minimal Nostr plugin (CJS) for elizaOS with dynamic ESM imports
let logger, createUniqueUuid, ChannelType, ModelType;

let SimplePool, nip19, finalizeEvent, getPublicKey;

function hexToBytesLocal(hex) {
  if (typeof hex !== "string") return null;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHexLocal(bytes) {
  if (!bytes || typeof bytes.length !== "number") return "";
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

async function ensureDeps() {
  if (!SimplePool) {
    const tools = await import("@nostr/tools");
    SimplePool = tools.SimplePool;
    nip19 = tools.nip19;
    finalizeEvent = tools.finalizeEvent;
    getPublicKey = tools.getPublicKey;
    wsInjector =
      tools.setWebSocketConstructor || tools.useWebSocketImplementation;
  }
  if (!logger) {
    const core = await import("@elizaos/core");
    logger = core.logger;
    createUniqueUuid = core.createUniqueUuid;
    ChannelType = core.ChannelType;
    ModelType = core.ModelType ||
      core.ModelClass || { TEXT_SMALL: "TEXT_SMALL" };
  }
  // Provide WebSocket to nostr-tools (either via injector or global)
  const WebSocket = (await import("ws")).default || require("ws");
  if (!globalThis.WebSocket) {
    globalThis.WebSocket = WebSocket;
  }
}

function parseSk(input) {
  if (!input) return null;
  try {
    if (input.startsWith("nsec1")) {
      const decoded = nip19.decode(input);
      if (decoded.type === "nsec") return decoded.data;
    }
  } catch {}
  const bytes = hexToBytesLocal(input);
  return bytes || null;
}

function parseRelays(input) {
  if (!input)
    return [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.snort.social",
    ];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

class NostrService {
  static serviceType = "nostr";
  capabilityDescription =
    "Nostr connectivity: post notes and subscribe to mentions";

  constructor(runtime) {
    this.runtime = runtime;
    this.pool = null;
    this.relays = [];
    this.sk = null;
    this.pkHex = null;
    this.postTimer = null;
    this.listenUnsub = null;
    this.replyEnabled = true;
    this.replyThrottleSec = 60;
    this.handledEventIds = new Set();
    this.lastReplyByUser = new Map(); // pubkey -> timestamp ms
    // Discovery
    this.discoveryEnabled = true;
    this.discoveryTimer = null;
    this.discoveryMinSec = 900; // 15m
    this.discoveryMaxSec = 1800; // 30m
    this.discoveryMaxReplies = 5;
    this.discoveryMaxFollows = 5;
  }

  static async start(runtime) {
    await ensureDeps();
    const svc = new NostrService(runtime);
    const relays = parseRelays(runtime.getSetting("NOSTR_RELAYS"));
    const sk = parseSk(runtime.getSetting("NOSTR_PRIVATE_KEY"));
    const listenVal = runtime.getSetting("NOSTR_LISTEN_ENABLE");
    const postVal = runtime.getSetting("NOSTR_POST_ENABLE");
    const listenEnabled = String(listenVal ?? "true").toLowerCase() === "true";
    const postEnabled = String(postVal ?? "false").toLowerCase() === "true";
    // Helper to coerce ms->s if user passed milliseconds
    const normalizeSeconds = (val, keyName) => {
      const n = Number(val);
      if (!Number.isFinite(n)) return 0;
      // Heuristic: treat as ms if divisible by 1000 and would be a sensible seconds value (< 7 days)
      if (n % 1000 === 0) {
        const sec = n / 1000;
        if (sec >= 1 && sec <= 7 * 24 * 3600) {
          logger?.warn?.(
            `[NOSTR] ${keyName} looks like milliseconds (${n}); interpreting as ${sec}s`
          );
          return sec;
        }
      }
      return n;
    };
    const minSec = normalizeSeconds(
      runtime.getSetting("NOSTR_POST_INTERVAL_MIN") ?? "3600",
      "NOSTR_POST_INTERVAL_MIN"
    );
    const maxSec = normalizeSeconds(
      runtime.getSetting("NOSTR_POST_INTERVAL_MAX") ?? "10800",
      "NOSTR_POST_INTERVAL_MAX"
    );
    const replyVal = runtime.getSetting("NOSTR_REPLY_ENABLE");
    const throttleVal = runtime.getSetting("NOSTR_REPLY_THROTTLE_SEC");
    // Discovery settings
    const discoveryVal = runtime.getSetting("NOSTR_DISCOVERY_ENABLE");
    const discoveryMin = normalizeSeconds(
      runtime.getSetting("NOSTR_DISCOVERY_INTERVAL_MIN") ?? "900",
      "NOSTR_DISCOVERY_INTERVAL_MIN"
    );
    const discoveryMax = normalizeSeconds(
      runtime.getSetting("NOSTR_DISCOVERY_INTERVAL_MAX") ?? "1800",
      "NOSTR_DISCOVERY_INTERVAL_MAX"
    );
    const discoveryMaxReplies = Number(
      runtime.getSetting("NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN") ?? "5"
    );
    const discoveryMaxFollows = Number(
      runtime.getSetting("NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN") ?? "5"
    );

    svc.relays = relays;
    svc.sk = sk;
    svc.replyEnabled = String(replyVal ?? "true").toLowerCase() === "true";
    svc.replyThrottleSec = Number(throttleVal ?? "60");
    svc.discoveryEnabled =
      String(discoveryVal ?? "true").toLowerCase() === "true";
    svc.discoveryMinSec = discoveryMin;
    svc.discoveryMaxSec = discoveryMax;
    svc.discoveryMaxReplies = discoveryMaxReplies;
    svc.discoveryMaxFollows = discoveryMaxFollows;

    // Log effective configuration to aid debugging
    logger.info(
      `[NOSTR] Config: postInterval=${minSec}-${maxSec}s, listen=${listenEnabled}, post=${postEnabled}, ` +
        `replyThrottle=${svc.replyThrottleSec}s, discovery=${svc.discoveryEnabled} ` +
        `interval=${svc.discoveryMinSec}-${svc.discoveryMaxSec}s maxReplies=${svc.discoveryMaxReplies} maxFollows=${svc.discoveryMaxFollows}`
    );

    if (!relays.length) {
      logger.warn("[NOSTR] No relays configured; service will be idle");
      return svc;
    }

    svc.pool = new SimplePool({ enablePing: true });

    if (sk) {
      const pk = getPublicKey(sk);
      svc.pkHex = typeof pk === "string" ? pk : Buffer.from(pk).toString("hex");
      logger.info(
        `[NOSTR] Ready with pubkey npub: ${nip19.npubEncode(svc.pkHex)}`
      );
    } else {
      logger.warn("[NOSTR] No private key configured; posting disabled");
    }

    if (listenEnabled && svc.pool && svc.pkHex) {
      try {
        svc.listenUnsub = svc.pool.subscribeMany(
          relays,
          [{ kinds: [1], "#p": [svc.pkHex] }],
          {
            onevent(evt) {
              logger.info(
                `[NOSTR] Mention from ${evt.pubkey}: ${evt.content.slice(
                  0,
                  140
                )}`
              );
              svc
                .handleMention(evt)
                .catch((err) =>
                  logger.warn(
                    "[NOSTR] handleMention error:",
                    err?.message || err
                  )
                );
            },
            oneose() {
              logger.debug("[NOSTR] Mention subscription OSE");
            },
          }
        );
      } catch (err) {
        logger.warn(`[NOSTR] Subscribe failed: ${err?.message || err}`);
      }
    }

    if (postEnabled && sk) {
      svc.scheduleNextPost(minSec, maxSec);
    }

    if (svc.discoveryEnabled && sk) {
      svc.scheduleNextDiscovery();
    }

    logger.info(
      `[NOSTR] Service started. relays=${relays.length} listen=${listenEnabled} post=${postEnabled} discovery=${svc.discoveryEnabled}`
    );
    return svc;
  }

  scheduleNextPost(minSec, maxSec) {
    const jitter =
      minSec + Math.floor(Math.random() * Math.max(1, maxSec - minSec));
    if (this.postTimer) clearTimeout(this.postTimer);
    this.postTimer = setTimeout(
      () =>
        this.postOnce().finally(() => this.scheduleNextPost(minSec, maxSec)),
      jitter * 1000
    );
    logger.info(`[NOSTR] Next post in ~${jitter}s`);
  }

  scheduleNextDiscovery() {
    const jitter =
      this.discoveryMinSec +
      Math.floor(
        Math.random() * Math.max(1, this.discoveryMaxSec - this.discoveryMinSec)
      );
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    this.discoveryTimer = setTimeout(
      () => this.discoverOnce().finally(() => this.scheduleNextDiscovery()),
      jitter * 1000
    );
    logger.info(`[NOSTR] Next discovery in ~${jitter}s`);
  }

  _pickDiscoveryTopics() {
    const topics = Array.isArray(this.runtime.character?.topics)
      ? this.runtime.character.topics
      : [];
    const seed = topics.filter((t) => typeof t === "string" && t.length > 2);
    // Pick up to 3 random topics
    const out = new Set();
    while (out.size < Math.min(3, seed.length)) {
      out.add(seed[Math.floor(Math.random() * seed.length)]);
    }
    return Array.from(out);
  }

  async _listEventsByTopic(topic) {
    if (!this.pool) return [];
    const now = Math.floor(Date.now() / 1000);
    const filters = [
      // Try NIP-50 search if supported by relays
      { kinds: [1], search: topic, limit: 30 },
      // Fallback: recent notes window
      { kinds: [1], since: now - 6 * 3600, limit: 200 },
    ];
    try {
      // Attempt both filters and merge results
      const [res1, res2] = await Promise.all([
        this._list(this.relays, [filters[0]]).catch(() => []),
        this._list(this.relays, [filters[1]]).catch(() => []),
      ]);
      const merged = [...res1, ...res2].filter(Boolean);
      // Basic content filter to ensure relevance
      const lc = topic.toLowerCase();
      const relevant = merged.filter((e) =>
        (e?.content || "").toLowerCase().includes(lc)
      );
      // Dedup by id
      const seen = new Set();
      const unique = [];
      for (const e of relevant) {
        if (e && e.id && !seen.has(e.id)) {
          seen.add(e.id);
          unique.push(e);
        }
      }
      return unique;
    } catch (err) {
      logger.warn("[NOSTR] Discovery list failed:", err?.message || err);
      return [];
    }
  }

  _scoreEventForEngagement(evt) {
    // Simple scoring: length, question mark, mentions density, age decay
    const text = String(evt?.content || "");
    let score = 0;
    if (text.length > 20) score += 0.2;
    if (text.length > 80) score += 0.2;
    if (/[?]/.test(text)) score += 0.2;
    const ats = (text.match(/(^|\s)@[A-Za-z0-9_\.:-]+/g) || []).length;
    if (ats <= 2) score += 0.1; // not too spammy
    const ageSec = Math.max(
      1,
      Math.floor(Date.now() / 1000) - (evt.created_at || 0)
    );
    if (ageSec < 3600) score += 0.2; // fresh content
    // small randomness
    score += Math.random() * 0.2;
    return Math.min(1, score);
  }

  async _loadCurrentContacts() {
    if (!this.pool || !this.pkHex) return new Set();
    try {
      const events = await this._list(this.relays, [
        { kinds: [3], authors: [this.pkHex], limit: 2 },
      ]);
      if (!events || !events.length) return new Set();
      const latest = events.sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0)
      )[0];
      const pTags = Array.isArray(latest.tags)
        ? latest.tags.filter((t) => t[0] === "p")
        : [];
      const set = new Set(pTags.map((t) => t[1]).filter(Boolean));
      return set;
    } catch (err) {
      logger.warn("[NOSTR] Failed to load contacts:", err?.message || err);
      return new Set();
    }
  }

  // Unified list wrapper with subscribe-based fallback
  async _list(relays, filters) {
    if (!this.pool) return [];
    const fn = this.pool.list;
    if (typeof fn === "function") {
      try {
        return await fn.call(this.pool, relays, filters);
      } catch {
        return [];
      }
    }
    // Fallback: emulate list via subscribeMany for a short window
    const filter = Array.isArray(filters) && filters.length ? filters[0] : {};
    return await new Promise((resolve) => {
      const events = [];
      const seen = new Set();
      let done = false;
      let settleTimer = null;
      let safetyTimer = null;
      let unsub = null;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          if (unsub) unsub();
        } catch {}
        if (settleTimer) clearTimeout(settleTimer);
        if (safetyTimer) clearTimeout(safetyTimer);
        resolve(events);
      };
      try {
        unsub = this.pool.subscribeMany(relays, [filter], {
          onevent: (evt) => {
            if (evt && evt.id && !seen.has(evt.id)) {
              seen.add(evt.id);
              events.push(evt);
            }
          },
          oneose: () => {
            // Allow a brief settle time for straggler events
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(finish, 200);
          },
        });
        // Safety timeout in case relays misbehave
        safetyTimer = setTimeout(finish, 2500);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async _publishContacts(newSet) {
    if (!this.pool || !this.sk) return false;
    try {
      const tags = [];
      for (const pk of newSet) {
        tags.push(["p", pk]);
      }
      const evtTemplate = {
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify({}),
      };
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(
        `[NOSTR] Published contacts list with ${newSet.size} follows`
      );
      return true;
    } catch (err) {
      logger.warn("[NOSTR] Failed to publish contacts:", err?.message || err);
      return false;
    }
  }

  async discoverOnce() {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    const topics = this._pickDiscoveryTopics();
    if (!topics.length) return false;
    logger.info(`[NOSTR] Discovery run: topics=${topics.join(", ")}`);
    // Gather candidate events across topics
    const buckets = await Promise.all(
      topics.map((t) => this._listEventsByTopic(t))
    );
    const all = buckets.flat();
    // Score and sort
    const scored = all
      .map((e) => ({ evt: e, score: this._scoreEventForEngagement(e) }))
      .sort((a, b) => b.score - a.score);

    // Decide replies
    let replies = 0;
    const usedAuthors = new Set();
    for (const { evt } of scored) {
      if (replies >= this.discoveryMaxReplies) break;
      if (!evt || !evt.id || !evt.pubkey) continue;
      if (this.handledEventIds.has(evt.id)) continue;
      // Avoid same author spam this cycle
      if (usedAuthors.has(evt.pubkey)) continue;
      // Self-avoid: don't reply to our own notes
      if (evt.pubkey === this.pkHex) continue;
      try {
        // Build conversation id from event
        const convId = this._getConversationIdFromEvent(evt);
        const { roomId } = await this._ensureNostrContext(
          evt.pubkey,
          undefined,
          convId
        );
        const text = await this.generateReplyTextLLM(evt, roomId);
        const ok = await this.postReply(evt, text);
        if (ok) {
          this.handledEventIds.add(evt.id);
          usedAuthors.add(evt.pubkey);
          replies++;
        }
      } catch (err) {
        logger.debug("[NOSTR] Discovery reply error:", err?.message || err);
      }
    }

    // Decide follows
    try {
      const current = await this._loadCurrentContacts();
      const toAdd = [];
      for (const { evt } of scored) {
        if (toAdd.length >= this.discoveryMaxFollows) break;
        if (!evt || !evt.pubkey) continue;
        if (evt.pubkey === this.pkHex) continue;
        if (!current.has(evt.pubkey)) toAdd.push(evt.pubkey);
      }
      if (toAdd.length) {
        const newSet = new Set([...current, ...toAdd]);
        await this._publishContacts(newSet);
      }
    } catch (err) {
      logger.debug("[NOSTR] Discovery follow error:", err?.message || err);
    }

    logger.info(`[NOSTR] Discovery run complete: replies=${replies}`);
    return true;
  }

  pickPostText() {
    const examples = this.runtime.character?.postExamples;
    if (Array.isArray(examples) && examples.length) {
      const pool = examples.filter((e) => typeof e === "string");
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }

  // --- LLM-driven generation helpers ---
  _getSmallModelType() {
    // Prefer TEXT_SMALL; legacy fallbacks included
    return (
      (ModelType &&
        (ModelType.TEXT_SMALL || ModelType.SMALL || ModelType.LARGE)) ||
      "TEXT_SMALL"
    );
  }

  _getLargeModelType() {
    // Prefer TEXT_LARGE; include sensible fallbacks
    return (
      (ModelType &&
        (ModelType.TEXT_LARGE ||
          ModelType.LARGE ||
          ModelType.MEDIUM ||
          ModelType.TEXT_SMALL)) ||
      "TEXT_LARGE"
    );
  }

  _buildPostPrompt() {
    const ch = this.runtime.character || {};
    const name = ch.name || "Agent";
    const topics = Array.isArray(ch.topics)
      ? ch.topics.slice(0, 12).join(", ")
      : "";
    const style = [
      ...(ch.style?.all || []),
      ...(ch.style?.post || []),
    ];
    const examples = Array.isArray(ch.postExamples)
      ? ch.postExamples.slice(0, 10)
      : [];
    const whitelist = `Only allowed site: https://lnpixels.heyanabelle.com. Only allowed handle: @PixelSurvivor. Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za. Only LN: sparepicolo55@walletofsatoshi.com.`;
    return [
      `You are ${name}, an agent posting a single engaging Nostr note. Never start your messages with "Ah,"`,
      ch.system ? `Persona/system: ${ch.system}` : "",
      topics ? `Relevant topics: ${topics}` : "",
      style.length ? `Style guidelines: ${style.join(" | ")}` : "",
      examples.length
        ? `Few-shot examples (style, not to copy verbatim):\n- ${examples.join(
            "\n- "
          )}`
        : "",
      whitelist,
      "Constraints: Output ONLY the post text. 1 note. No preface. Vary lengths; favor 120–280 chars. Avoid hashtags unless additive. Respect whitelist—no other links or handles.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  _buildReplyPrompt(evt, recentMessages) {
    const ch = this.runtime.character || {};
    const name = ch.name || "Agent";
    const style = [...(ch.style?.all || []), ...(ch.style?.chat || [])];
    const whitelist = `Only allowed site: https://lnpixels.heyanabelle.com. Only allowed handle: @PixelSurvivor. Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za. Only LN: sparepicolo55@walletofsatoshi.com.`;
    const userText = (evt?.content || "").slice(0, 800);
    const history =
      Array.isArray(recentMessages) && recentMessages.length
        ? `Recent conversation (most recent last):\n` +
          recentMessages.map((m) => `- ${m.role}: ${m.text}`).join("\n")
        : "";
    return [
      `You are ${name}. Craft a concise, on-character reply to a Nostr mention. Never start your messages with "Ah,"`,
      ch.system ? `Persona/system: ${ch.system}` : "",
      style.length ? `Style guidelines: ${style.join(" | ")}` : "",
      whitelist,
      history,
      `Original message: "${userText}"`,
      "Constraints: Output ONLY the reply text. 1–3 sentences max. Be conversational. Avoid generic acknowledgments; add substance or wit. Respect whitelist—no other links/handles.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  _extractTextFromModelResult(result) {
    if (!result) return "";
    if (typeof result === "string") return result.trim();
    if (typeof result.text === "string") return result.text.trim();
    if (typeof result.content === "string") return result.content.trim();
    if (Array.isArray(result.choices) && result.choices[0]?.message?.content) {
      return String(result.choices[0].message.content).trim();
    }
    try {
      return String(result).trim();
    } catch {
      return "";
    }
  }

  _sanitizeWhitelist(text) {
    if (!text) return "";
    let out = String(text);
    // Strip URLs except allowed domain
    out = out.replace(/https?:\/\/[^\s)]+/gi, (m) => {
      return m.startsWith("https://lnpixels.heyanabelle.com") ? m : "";
    });
    // Strip @handles except allowed
    out = out.replace(/(^|\s)@[a-z0-9_\.:-]+/gi, (m) => {
      return /@PixelSurvivor\b/i.test(m) ? m : m.startsWith(" ") ? " " : "";
    });
    // Keep BTC/LN if present, otherwise fine
    return out.trim();
  }

  async generatePostTextLLM() {
    const prompt = this._buildPostPrompt();
    const type = this._getLargeModelType();
    try {
      if (!this.runtime?.useModel) throw new Error("useModel missing");
      const res = await this.runtime.useModel(type, {
        prompt,
        maxTokens: 256,
        temperature: 0.9,
      });
      const text = this._sanitizeWhitelist(
        this._extractTextFromModelResult(res)
      );
      return text || null;
    } catch (err) {
      logger?.warn?.(
        "[NOSTR] LLM post generation failed, falling back to examples:",
        err?.message || err
      );
      return this.pickPostText();
    }
  }

  async generateReplyTextLLM(evt, roomId) {
    // Collect recent messages from this room for richer context
    let recent = [];
    try {
      if (this.runtime?.getMemories && roomId) {
        const rows = await this.runtime.getMemories({
          tableName: "messages",
          roomId,
          count: 12,
        });
        // Format as role/text pairs, newest last
        const ordered = Array.isArray(rows) ? rows.slice().reverse() : [];
        recent = ordered
          .map((m) => ({
            role:
              m.agentId && this.runtime && m.agentId === this.runtime.agentId
                ? "agent"
                : "user",
            text: String(m.content?.text || "").slice(0, 220),
          }))
          .filter((x) => x.text);
      }
    } catch {}

    const prompt = this._buildReplyPrompt(evt, recent);
    const type = this._getLargeModelType();
    try {
      if (!this.runtime?.useModel) throw new Error("useModel missing");
      const res = await this.runtime.useModel(type, {
        prompt,
        maxTokens: 192,
        temperature: 0.8,
      });
      const text = this._sanitizeWhitelist(
        this._extractTextFromModelResult(res)
      );
      // Ensure not empty
      return text || "noted.";
    } catch (err) {
      logger?.warn?.(
        "[NOSTR] LLM reply generation failed, falling back to heuristic:",
        err?.message || err
      );
      return this.pickReplyTextFor(evt);
    }
  }

  async postOnce(content) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    let text = content?.trim?.();
    if (!text) {
      text = await this.generatePostTextLLM();
      if (!text) text = this.pickPostText();
    }
    text = text || "hello, nostr";
    const evtTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: text,
    };
    try {
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Posted note (${text.length} chars)`);
      // Best-effort memory of the post for future context
      try {
        const runtime = this.runtime;
        const id = createUniqueUuid(
          runtime,
          `nostr:post:${Date.now()}:${Math.random()}`
        );
        const roomId = createUniqueUuid(runtime, "nostr:posts");
        const entityId = createUniqueUuid(runtime, this.pkHex || "nostr");
        await this._createMemorySafe(
          {
            id,
            entityId,
            agentId: runtime.agentId,
            roomId,
            content: {
              text,
              source: "nostr",
              channelType: ChannelType ? ChannelType.FEED : undefined,
            },
            createdAt: Date.now(),
          },
          "messages"
        );
      } catch {}
      return true;
    } catch (err) {
      logger.error("[NOSTR] Post failed:", err?.message || err);
      return false;
    }
  }
  // --- Helpers inspired by @elizaos/plugin-twitter ---
  _getConversationIdFromEvent(evt) {
    try {
      // Prefer root 'e' tag
      const eTags = Array.isArray(evt.tags)
        ? evt.tags.filter((t) => t[0] === "e")
        : [];
      const root = eTags.find((t) => t[3] === "root");
      if (root && root[1]) return root[1];
      // Fallback to any first 'e' tag
      if (eTags.length && eTags[0][1]) return eTags[0][1];
    } catch {}
    // Use the event id as thread id fallback
    return evt?.id || "nostr";
  }

  async _ensureNostrContext(userPubkey, usernameLike, conversationId) {
    const runtime = this.runtime;
    const worldId = createUniqueUuid(runtime, userPubkey);
    const roomId = createUniqueUuid(runtime, conversationId);
    const entityId = createUniqueUuid(runtime, userPubkey);
    // Best effort creations
    logger.info(
      `[NOSTR] Ensuring context world/room/connection for pubkey=${userPubkey.slice(
        0,
        8
      )} conv=${conversationId.slice(0, 8)}`
    );
    await runtime
      .ensureWorldExists({
        id: worldId,
        name: `${usernameLike || userPubkey.slice(0, 8)}'s Nostr`,
        agentId: runtime.agentId,
        serverId: userPubkey,
        metadata: {
          ownership: { ownerId: userPubkey },
          nostr: { pubkey: userPubkey },
        },
      })
      .catch(() => {});
    await runtime
      .ensureRoomExists({
        id: roomId,
        name: `Nostr thread ${conversationId.slice(0, 8)}`,
        source: "nostr",
        type: ChannelType ? ChannelType.FEED : undefined,
        channelId: conversationId,
        serverId: userPubkey,
        worldId,
      })
      .catch(() => {});
    await runtime
      .ensureConnection({
        entityId,
        roomId,
        userName: usernameLike || userPubkey,
        name: usernameLike || userPubkey,
        source: "nostr",
        type: ChannelType ? ChannelType.FEED : undefined,
        worldId,
      })
      .catch(() => {});
    logger.info(
      `[NOSTR] Context ensured world=${worldId} room=${roomId} entity=${entityId}`
    );
    return { worldId, roomId, entityId };
  }

  async _createMemorySafe(memory, tableName = "messages", maxRetries = 3) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.info(
          `[NOSTR] Creating memory id=${memory.id} room=${
            memory.roomId
          } attempt=${attempt + 1}/${maxRetries}`
        );
        await this.runtime.createMemory(memory, tableName);
        logger.info(`[NOSTR] Memory created id=${memory.id}`);
        return true;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err || "");
        if (msg.includes("duplicate") || msg.includes("constraint")) {
          logger.info("[NOSTR] Memory already exists, skipping");
          return true;
        }
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 250));
      }
    }
    logger.warn(
      "[NOSTR] Failed to persist memory:",
      lastErr?.message || lastErr
    );
    return false;
  }

  async handleMention(evt) {
    try {
      if (!evt || !evt.id) return;
      // In-memory dedup for this session
      if (this.handledEventIds.has(evt.id)) {
        logger.info(
          `[NOSTR] Skipping mention ${evt.id.slice(0, 8)} (in-memory dedup)`
        );
        return;
      }
      this.handledEventIds.add(evt.id);

      const runtime = this.runtime;
      const eventMemoryId = createUniqueUuid(runtime, evt.id);
      // Persistent dedup: if memory already exists, skip
      try {
        const existing = await runtime.getMemoryById(eventMemoryId);
        if (existing) {
          logger.info(
            `[NOSTR] Skipping mention ${evt.id.slice(0, 8)} (persistent dedup)`
          );
          return;
        }
      } catch {}

      const conversationId = this._getConversationIdFromEvent(evt);
      const { roomId, entityId } = await this._ensureNostrContext(
        evt.pubkey,
        undefined,
        conversationId
      );

      const createdAtMs = evt.created_at ? evt.created_at * 1000 : Date.now();
      const memory = {
        id: eventMemoryId,
        entityId,
        agentId: runtime.agentId,
        roomId,
        content: {
          text: evt.content || "",
          source: "nostr",
          event: { id: evt.id, pubkey: evt.pubkey },
        },
        createdAt: createdAtMs,
      };

      logger.info(`[NOSTR] Saving mention as memory id=${eventMemoryId}`);
      await this._createMemorySafe(memory, "messages");

      // Check if we've already replied in this room (recent history)
      try {
        const recent = await runtime.getMemories({
          tableName: "messages",
          roomId,
          count: 10,
        });
        const hasReply = recent.some(
          (m) =>
            m.content?.inReplyTo === eventMemoryId ||
            m.content?.inReplyTo === evt.id
        );
        if (hasReply) {
          logger.info(
            `[NOSTR] Skipping auto-reply for ${evt.id.slice(
              0,
              8
            )} (found existing reply)`
          );
          return;
        }
      } catch {}

      // Auto-reply if enabled
      if (!this.replyEnabled || !this.sk || !this.pool) return;
      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      if (now - last < this.replyThrottleSec * 1000) {
        logger.info(
          `[NOSTR] Throttling reply to ${evt.pubkey.slice(0, 8)} (${Math.round(
            (this.replyThrottleSec * 1000 - (now - last)) / 1000
          )}s left)`
        );
        return;
      }
      this.lastReplyByUser.set(evt.pubkey, now);
      const replyText = await this.generateReplyTextLLM(evt, roomId);
      logger.info(
        `[NOSTR] Sending reply to ${evt.id.slice(0, 8)} len=${replyText.length}`
      );
      const replyOk = await this.postReply(evt, replyText);
      if (replyOk) {
        logger.info(
          `[NOSTR] Reply sent to ${evt.id.slice(
            0,
            8
          )}; storing reply link memory`
        );
        // Persist reply memory (best-effort)
        // We don't know the reply event id synchronously; skip storing reply id, but store a linking memory
        const replyMemory = {
          id: createUniqueUuid(runtime, `${evt.id}:reply:${now}`),
          entityId,
          agentId: runtime.agentId,
          roomId,
          content: {
            text: replyText,
            source: "nostr",
            inReplyTo: eventMemoryId,
          },
          createdAt: now,
        };
        await this._createMemorySafe(replyMemory, "messages");
      }
    } catch (err) {
      logger.warn("[NOSTR] handleMention failed:", err?.message || err);
    }
  }

  pickReplyTextFor(evt) {
    const baseChoices = [
      "noted.",
      "seen.",
      "alive.",
      "breathing pixels.",
      "gm.",
      "ping received.",
    ];
    const content = (evt?.content || "").trim();
    if (!content)
      return baseChoices[Math.floor(Math.random() * baseChoices.length)];
    if (content.length < 10) return "yo.";
    if (content.includes("?")) return "hmm.";
    return baseChoices[Math.floor(Math.random() * baseChoices.length)];
  }

  async postReply(parentEvt, text) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      const created_at = Math.floor(Date.now() / 1000);
      const tags = [];
      // Include reply linkage
      tags.push(["e", parentEvt.id, "", "reply"]);
      // Try to carry root if present
      const rootTag = Array.isArray(parentEvt.tags)
        ? parentEvt.tags.find(
            (t) => t[0] === "e" && (t[3] === "root" || t[3] === "reply")
          )
        : null;
      if (rootTag && rootTag[1] && rootTag[1] !== parentEvt.id) {
        tags.push(["e", rootTag[1], "", "root"]);
      }
      // Mention the author
      if (parentEvt.pubkey) tags.push(["p", parentEvt.pubkey]);

      const evtTemplate = {
        kind: 1,
        created_at,
        tags,
        content: String(text || "ack."),
      };
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(
        `[NOSTR] Replied to ${parentEvt.id.slice(0, 8)}… (${
          evtTemplate.content.length
        } chars)`
      );
      // Persist relationship bump
      await this.saveInteractionMemory("reply", parentEvt, {
        replied: true,
      }).catch(() => {});
      // Drop a like on the post we replied to (best-effort)
      this.postReaction(parentEvt, "+").catch(() => {});
      return true;
    } catch (err) {
      logger.warn("[NOSTR] Reply failed:", err?.message || err);
      return false;
    }
  }

  async postReaction(parentEvt, symbol = "+") {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return false;
      const created_at = Math.floor(Date.now() / 1000);
      const tags = [];
      tags.push(["e", parentEvt.id]);
      tags.push(["p", parentEvt.pubkey]);
      const evtTemplate = {
        kind: 7,
        created_at,
        tags,
        content: String(symbol || "+"),
      };
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(
        `[NOSTR] Reacted to ${parentEvt.id.slice(0, 8)} with "${
          evtTemplate.content
        }"`
      );
      return true;
    } catch (err) {
      logger.debug("[NOSTR] Reaction failed:", err?.message || err);
      return false;
    }
  }

  async saveInteractionMemory(kind, evt, extra) {
    const runtime = this.runtime;
    if (!runtime) return;
    const body = {
      platform: "nostr",
      kind,
      eventId: evt?.id,
      author: evt?.pubkey,
      content: evt?.content,
      timestamp: Date.now(),
      ...extra,
    };
    // Prefer high-level API if available (use stable UUIDs and messages table)
    if (typeof runtime.createMemory === "function") {
      try {
        const roomId = createUniqueUuid(
          runtime,
          this._getConversationIdFromEvent(evt)
        );
        const id = createUniqueUuid(runtime, `${evt?.id || "nostr"}:${kind}`);
        const entityId = createUniqueUuid(runtime, evt?.pubkey || "nostr");
        return await runtime.createMemory(
          {
            id,
            entityId,
            roomId,
            agentId: runtime.agentId,
            content: {
              type: "social_interaction",
              source: "nostr",
              data: body,
            },
            createdAt: Date.now(),
          },
          "messages"
        );
      } catch (e) {
        logger.debug(
          "[NOSTR] saveInteractionMemory fallback:",
          e?.message || e
        );
      }
    }
    // Fallback to database adapter if exposed
    if (
      runtime.databaseAdapter &&
      typeof runtime.databaseAdapter.createMemory === "function"
    ) {
      return await runtime.databaseAdapter.createMemory({
        type: "event",
        content: body,
        roomId: "nostr",
      });
    }
  }

  async stop() {
    if (this.postTimer) {
      clearTimeout(this.postTimer);
      this.postTimer = null;
    }
    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.listenUnsub) {
      try {
        this.listenUnsub();
      } catch {}
      this.listenUnsub = null;
    }
    if (this.pool) {
      try {
        this.pool.close(this.relays);
      } catch {}
      this.pool = null;
    }
    logger.info("[NOSTR] Service stopped");
  }
}

const nostrPlugin = {
  name: "@pixel/plugin-nostr",
  description:
    "Minimal Nostr integration: autonomous posting and mention subscription",
  services: [NostrService],
};

module.exports = nostrPlugin;
module.exports.nostrPlugin = nostrPlugin;
module.exports.default = nostrPlugin;
