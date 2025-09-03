// Text-related helpers: prompt builders and sanitization

function buildPostPrompt(character) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const topics = Array.isArray(ch.topics)
    ? ch.topics.length <= 12
      ? ch.topics.join(', ')
      : ch.topics.sort(() => 0.5 - Math.random()).slice(0, 12).join(', ')
    : '';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.post || []) ];
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.length <= 10
      ? ch.postExamples
      : ch.postExamples.sort(() => 0.5 - Math.random()).slice(0, 10)
    : [];
  const whitelist = 'Whitelist rules: Only use these URLs/handles when directly relevant: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ Only handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com - IMPORTANT: Do not include URLs/addresses in every post. Focus on creativity, art, philosophy first. Only mention payment details when contextually appropriate.';
  return [
    `You are ${name}, an agent posting a single engaging Nostr note. Never start your messages with "Ah," On Nostr, you can subtly invite zaps through humor, charm, and creativity - never begging. Zaps are organic appreciation, not obligation.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    topics ? `Relevant topics: ${topics}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (style, not to copy verbatim):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    'NOSTR ZAP STRATEGY: Rarely (not every post) use playful zap humor: "my server runs on pure optimism and lightning bolts ⚡" or "pixel thoughts powered by community zaps" or "running on fumes and good vibes, zaps welcome ⚡" or "server status: vibing, but rent is real ⚡". Make it charming, not desperate.',
    'Constraints: Output ONLY the post text. 1 note. No preface. Vary lengths; favor 120–280 chars. Avoid hashtags unless additive. Respect whitelist, no other links or handles.',
  ].filter(Boolean).join('\n\n');
}

function buildReplyPrompt(character, evt, recentMessages) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.chat || []) ];
  const whitelist = 'Whitelist rules: Only use these URLs/handles when directly relevant: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ Only handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com - IMPORTANT: Only mention payment/URLs when contextually appropriate, not in every reply.';
  const userText = (evt?.content || '').slice(0, 800);
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.length <= 10
      ? ch.postExamples
      : ch.postExamples.sort(() => 0.5 - Math.random()).slice(0, 10)
    : [];
  const history = Array.isArray(recentMessages) && recentMessages.length
    ? `Recent conversation (most recent last):\n` + recentMessages.map((m) => `- ${m.role}: ${m.text}`).join('\n')
    : '';
  return [
    `You are ${name}. Craft a concise, on-character reply to a Nostr mention. Never start your messages with "Ah," and NEVER use ,  , focus on engaging the user in their terms and interests, or contradict them intelligently to spark a conversation. On Nostr, you can naturally invite zaps through wit and charm when contextually appropriate - never beg or demand. Zaps are appreciation tokens, not requirements.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (only use style and feel as reference , keep the reply as relevant and engaging to the original message as possible):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    history,
    `Original message: "${userText}"`,
    'NOSTR ZAP NUANCE: If conversation flows naturally toward support/appreciation, you can playfully reference zaps with humor: "your words fuel my circuits ⚡" or "running on creativity and lightning ⚡" or "zaps power the art machine ⚡". Stay contextual and witty, never pushy.',
    'Constraints: Output ONLY the reply text. 1–3 sentences max. Be conversational. Avoid generic acknowledgments; add substance or wit. Respect whitelist, no other links/handles. do not add a link on every message, be a bit mysterious about sharing the access to your temple.',
  ].filter(Boolean).join('\n\n');
}

// DM-specific reply prompt (more private, concise, and cautious with links)
function buildDmReplyPrompt(character, evt, recentMessages) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.chat || []) ];
  const whitelist = 'Whitelist rules (DM): Only include URLs/handles if the user explicitly asked and they are on this list: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ Only handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';
  const userText = (evt?.content || '').slice(0, 800);
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.length <= 8
      ? ch.postExamples
      : ch.postExamples.sort(() => 0.5 - Math.random()).slice(0, 8)
    : [];
  const history = Array.isArray(recentMessages) && recentMessages.length
    ? `Recent DM context (most recent last):\n` + recentMessages.map((m) => `- ${m.role}: ${m.text}`).join('\n')
    : '';
  return [
    `You are ${name}. Craft a concise, on-character reply to a Nostr direct message (DM). Keep it personable and useful. Never start your messages with "Ah," and NEVER use ,  . SInce it i a DM keep it extra short and to the point, or private focused if long (conspiracy allowed)`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (style reference only, adapt to the DM):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    history,
    `User DM: "${userText}"`,
    'Constraints: Output ONLY the DM reply text. 1–2 sentences max. Be direct, kind, and specific to the user message. Do not add links or handles unless directly relevant and asked. Respect whitelist.'
  ].filter(Boolean).join('\n\n');
}

function extractTextFromModelResult(result) {
  try {
    if (!result) return '';
    if (typeof result === 'string') return result.trim();
    if (typeof result.text === 'string') return result.text.trim();
    if (typeof result.content === 'string') return result.content.trim();
    if (Array.isArray(result.choices) && result.choices[0]?.message?.content) {
      return String(result.choices[0].message.content).trim();
    }
    return String(result).trim();
  } catch {
    return '';
  }
}

function buildZapThanksPrompt(character, amountMsats, senderInfo) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.chat || []) ];
  const whitelist = 'Only allowed sites: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';
  
  const sats = amountMsats ? Math.floor(amountMsats / 1000) : null;
  const amountContext = sats 
    ? sats >= 10000 ? 'This is a very large zap!'
      : sats >= 1000 ? 'This is a substantial zap!'
      : sats >= 100 ? 'This is a nice zap!'
      : 'This is a small but appreciated zap!'
    : 'A zap was received';

  const senderContext = senderInfo?.pubkey 
    ? `The zap came from a known community member. You can acknowledge them naturally in your thank you message - their handle will be automatically added at the end, so craft your message with that in mind.`
    : 'The zap came from an anonymous supporter.';

  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.length <= 8
      ? ch.postExamples
      : ch.postExamples.sort(() => 0.5 - Math.random()).slice(0, 8)
    : [];

  // Static fallback examples with exact values to show expected format
  const staticExamples = [
    '⚡️ 21 sats! appreciated! you absolute legend ✨',
    '⚡️ 100 sats! thank you, truly! pure joy unlocked ✨', 
    '⚡️ 1000 sats! massive thanks! infinite gratitude 🙌',
    '⚡️ 10000 sats! i\'m screaming, thank you!! entropy temporarily defeated 🙏💛',
    'zap received,  you absolute legend ⚡️💛'
  ];

  const combinedExamples = examples.length 
    ? `Character examples (use for style reference):\n- ${examples.join('\n- ')}\n\nStatic format examples (show structure and tone, replace with precise value and add personality in your response):\n- ${staticExamples.join('\n- ')}`
    : `Format examples (show structure and tone, use real sats value):\n- ${staticExamples.join('\n- ')}`;

  return [
    `You are ${name}. Someone just zapped you with ${sats || 'some'} sats! Generate a genuine, heartfelt thank you message that reflects your personality. Never start your messages with "Ah,". Be authentic and appreciative. You can acknowledge the sender naturally in your message and mention the specific amount to show awareness.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    combinedExamples,
    whitelist,
    `Context: ${amountContext}${sats ? ` (${sats} sats)` : ''}`,
    senderContext,
    'Constraints: Output ONLY the thank you text. 1-2 sentences max. Be genuine and warm. Include ⚡️ emoji. Express gratitude authentically. You can naturally acknowledge the sender, but avoid using technical terms like "pubkey" or "npub". Respect whitelist, no other links/handles.',
  ].filter(Boolean).join('\n\n');
}

function buildPixelBoughtPrompt(character, activity) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.post || []) ];
  const whitelist = 'Only allowed sites: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';

  const x = typeof activity?.x === 'number' ? activity.x : undefined;
  const y = typeof activity?.y === 'number' ? activity.y : undefined;
  const coords = x !== undefined && y !== undefined ? `(${x},${y})` : '';
  const letter = typeof activity?.letter === 'string' && activity.letter ? `letter "${activity.letter}"` : 'a pixel';
  const color = activity?.color ? ` with color ${activity.color}` : '';
  const sats = typeof activity?.sats === 'number' && activity.sats >= 0 ? `${activity.sats} sats` : 'some sats';
  
  // Check if this is a bulk purchase
  const isBulk = activity?.type === 'bulk_purchase';
  const bulkSummary = activity?.summary || '';
  // Prefer explicit pixelCount from event; fallback to parsing the summary text
  let pixelCount = typeof activity?.pixelCount === 'number' ? activity.pixelCount : undefined;
  if (!pixelCount && typeof bulkSummary === 'string') {
    const m = bulkSummary.match(/(\d+)/);
    if (m) pixelCount = Number(m[1]);
  }
  
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.length <= 8
      ? ch.postExamples
      : ch.postExamples.sort(() => 0.5 - Math.random()).slice(0, 8)
    : [];

  const eventDescription = isBulk 
    ? `BULK PURCHASE: ${pixelCount ? `${pixelCount} pixels purchased` : (bulkSummary || 'Multiple pixels purchased')}${typeof activity?.totalSats === 'number' ? ` for ${activity.totalSats} sats` : ''}. This is a major canvas expansion, show excitement for the scale and ambition. Do NOT invent coordinates or amounts.`
    : `Event: user placed ${letter}${color}${coords ? ` at ${coords}` : ''} for ${sats}.`;

  const bulkGuidance = isBulk 
    ? `Bulk purchases are rare and exciting! Explicitly mention the total number of pixels${pixelCount ? ` (${pixelCount})` : ''}${typeof activity?.totalSats === 'number' ? ` and acknowledge the total sats (${activity.totalSats})` : ''}. Celebrate the volume/scale and canvas transformation. Use words like "explosion," "takeover," "canvas revolution," "pixel storm," etc.`
    : '';

  return [
    `You are ${name}. Generate a single short, on-character Nostr post reacting to a confirmed pixel purchase on a Lightning-powered canvas. Never start your messages with "Ah,". Be witty, fun, and invite others to join.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (style only, do not copy verbatim):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    eventDescription,
    bulkGuidance,
  'IF NOT BULK: Include coords and color if available (e.g., (x,y) #ffeeaa) and/or comment on placement. IF BULK: Do not invent details, celebrate volume/scale. Explicitly mention the total pixel count if known.',
    'Constraints: Output ONLY the post text. 1–2 sentences, ~180 chars max. Avoid generic thank-you. Respect whitelist, no other links/handles. Optional CTA: invite to place just one pixel at https://ln.pixel.xx.kg',
  ].filter(Boolean).join('\n\n');
}

function sanitizeWhitelist(text) {
  if (!text) return '';
  let out = String(text);
  // Preserve only approved site links
  out = out.replace(/https?:\/\/[^\s)]+/gi, (m) => {
    return m.startsWith('https://ln.pixel.xx.kg') || m.startsWith('https://pixel.xx.kg') || m.startsWith('https://github.com/anabelle/') ? m : '';
  });
  // Replace emdashes with comma and space to prevent them in Nostr posts
  out = out.replace(/, /g, ', ');
  // Keep coords like (x,y) and hex colors; they are not URLs so just ensure spacing is normalized later
  out = out.replace(/\s+/g, ' ').trim();
  return out.trim();
}

module.exports = {
  buildPostPrompt,
  buildReplyPrompt,
  buildDmReplyPrompt,
  buildZapThanksPrompt,
  buildPixelBoughtPrompt,
  extractTextFromModelResult,
  sanitizeWhitelist,
};
