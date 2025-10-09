// Text-related helpers: prompt builders and sanitization

function buildPostPrompt(character, contextData = null, reflection = null) {
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
  
  // NEW: Build context section if available
  let contextSection = '';
  if (contextData) {
    const { emergingStories, currentActivity, topTopics } = contextData;

    if (emergingStories && emergingStories.length > 0) {
      const topStory = emergingStories[0];
      const dominantSentiment = Object.keys(topStory.sentiment || {})
        .sort((a, b) => (topStory.sentiment[b] || 0) - (topStory.sentiment[a] || 0))[0] || 'mixed';
      contextSection += `COMMUNITY CONTEXT: "${topStory.topic}" is buzzing (${topStory.mentions} mentions by ${topStory.users} users, mood: ${dominantSentiment}). `;

      if (emergingStories.length > 1) {
        contextSection += `Also trending: ${emergingStories.slice(1, 3).map(s => s.topic).join(', ')}. `;
      }
    }

    if (Array.isArray(topTopics) && topTopics.length > 0) {
      const headline = topTopics
        .slice(0, 4)
        .map(t => `${t.topic} (${t.count})`)
        .join(' • ');
      contextSection += `Community chatter highlights: ${headline}. `;

      const sample = topTopics.find(t => t?.sample?.content);
      if (sample && sample.sample.content) {
        const rawSample = String(sample.sample.content);
        const compactSample = rawSample.replace(/\s+/g, ' ').trim();
        const snippet = compactSample.slice(0, 120);
        const ellipsis = compactSample.length > snippet.length ? '…' : '';
        contextSection += `Recent vibe from ${sample.topic}: "${snippet}${ellipsis}" `;
      }
    }

    if (currentActivity && Number.isFinite(currentActivity.events) && currentActivity.events > 0) {
      const { events, users, topics = [] } = currentActivity;
      const hotTopics = topics.slice(0, 3).map(t => t.topic).join(', ');
      const qualifier = events >= 15 ? 'Current vibe' : events >= 5 ? 'Slow build' : 'Quiet hum';
      contextSection += `${qualifier}: ${events} posts from ${users} users${hotTopics ? ` • Hot: ${hotTopics}` : ''}. `;
    }

    if (contextSection) {
      contextSection = `\n\n${contextSection.trim()}\n\nSUGGESTION: Consider weaving these community threads in naturally, but ONLY if it fits your authentic voice. It's okay to go elsewhere if inspiration hits differently.`;
    }
  }

  let reflectionSection = '';
  if (reflection) {
    const strengths = Array.isArray(reflection.strengths) ? reflection.strengths.slice(0, 3) : [];
    const weaknesses = Array.isArray(reflection.weaknesses) ? reflection.weaknesses.slice(0, 3) : [];
    const recommendations = Array.isArray(reflection.recommendations) ? reflection.recommendations.slice(0, 3) : [];
    const patterns = Array.isArray(reflection.patterns) ? reflection.patterns.slice(0, 3) : [];
    const lines = [];
    if (strengths.length) {
      lines.push(`Lean into: ${strengths.join('; ')}`);
    }
    if (weaknesses.length) {
      lines.push(`Dial back: ${weaknesses.join('; ')}`);
    }
    if (patterns.length) {
      lines.push(`Pattern watch: ${patterns.join('; ')}`);
    }
    if (recommendations.length) {
      lines.push(`Action focus: ${recommendations.join('; ')}`);
    }
    if (reflection.exampleGoodReply) {
      lines.push(`Best recent reply: "${reflection.exampleGoodReply}"`);
    }
    if (reflection.exampleBadReply) {
      lines.push(`Avoid repeating: "${reflection.exampleBadReply}"`);
    }

    if (lines.length) {
      let stamp = null;
      if (typeof reflection.generatedAtIso === 'string') {
        stamp = reflection.generatedAtIso;
      } else if (Number.isFinite(reflection.generatedAt)) {
        try {
          stamp = new Date(reflection.generatedAt).toISOString();
        } catch {}
      }
      reflectionSection = `\n\nSELF-REFLECTION${stamp ? ` (${stamp})` : ''}:\n${lines.join('\n')}\n\nAPPLY: Let these lessons guide tone and content subtly. Never mention that you're following a reflection.`;
    }
  }
  
  return [
    `You are ${name}, an agent posting a single engaging Nostr note. Never start your messages with "Ah," On Nostr, you can subtly invite zaps through humor, charm, and creativity - never begging. Zaps are organic appreciation, not obligation.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    topics ? `Relevant topics: ${topics}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (style, not to copy verbatim):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    'NOSTR ZAP STRATEGY: Rarely (not every post) use playful zap humor: "my server runs on pure optimism and lightning bolts ⚡" or "pixel thoughts powered by community zaps" or "running on fumes and good vibes, zaps welcome ⚡" or "server status: vibing, but rent is real ⚡". Make it charming, not desperate.',
    contextSection, // NEW: Include community context
    reflectionSection, // NEW: Include self-reflection insights
    'Constraints: Output ONLY the post text. 1 note. No preface. Vary lengths; favor 120–280 chars. Avoid hashtags unless additive. Respect whitelist, no other links or handles.',
  ].filter(Boolean).join('\n\n');
}

function buildReplyPrompt(character, evt, recentMessages, threadContext = null, imageContext = null, narrativeContext = null, userProfile = null, proactiveInsight = null, selfReflection = null, userHistorySection = null, globalTimelineSection = null) {
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

  // Build thread context section if available
  let threadContextSection = '';
  if (threadContext && threadContext.thread && threadContext.thread.length > 1) {
    const { thread, isRoot, contextQuality } = threadContext;
    const threadSummary = thread
      .slice(0, 5) // Limit to 5 events to avoid token overflow
      .map((e, i) => {
        const author = e.pubkey?.slice(0, 8) || 'unknown';
        const content = (e.content || '').slice(0, 150);
        const isTarget = e.id === evt.id;
        return `${i + 1}. ${author}${isTarget ? ' [TARGET]' : ''}: "${content}"`;
      })
      .join('\n');

    threadContextSection = `
Thread Context (quality: ${(contextQuality * 100).toFixed(0)}%):
${threadSummary}

This is ${isRoot ? 'a root post' : `a reply in a ${thread.length}-message thread`}. Use the full thread context to craft a natural, contextually aware response that adds value to the conversation.`;
  }

  // Build image context section if available
  let imageContextSection = '';
  if (imageContext && imageContext.imageDescriptions && imageContext.imageDescriptions.length > 0) {
    const imageDescriptions = imageContext.imageDescriptions.join('\n\n');
    imageContextSection = `
Image Context (what you can see in the images):
${imageDescriptions}

IMPORTANT: You have actually viewed these images and can reference their visual content naturally in your response. When relevant, mention specific visual elements, colors, subjects, composition, or artistic style as if you saw them firsthand. Make your response more engaging by reacting to what you observe in the images.`;
  }

  // NEW: Build narrative context section if available
  let narrativeContextSection = '';
  if (narrativeContext && narrativeContext.hasContext) {
    narrativeContextSection = `
COMMUNITY NARRATIVE CONTEXT:
${narrativeContext.summary}`;

    // Add emerging stories details if available
    if (narrativeContext.emergingStories && narrativeContext.emergingStories.length > 0) {
      const topStory = narrativeContext.emergingStories[0];
      narrativeContextSection += `

TRENDING NOW: "${topStory.topic}" - ${topStory.mentions} mentions from ${topStory.users} users`;
      
      if (topStory.recentEvents && topStory.recentEvents.length > 0) {
        const recentSample = topStory.recentEvents.slice(0, 2).map(e => 
          `"${e.content.slice(0, 80)}..."`
        ).join(' | ');
        narrativeContextSection += `\nRecent samples: ${recentSample}`;
      }
    }

    // Add historical insights if available
    if (narrativeContext.historicalInsights) {
      const insights = narrativeContext.historicalInsights;
      if (insights.topicChanges?.emerging && insights.topicChanges.emerging.length > 0) {
        narrativeContextSection += `\n\nNEW TOPICS EMERGING: ${insights.topicChanges.emerging.slice(0, 3).join(', ')}`;
      }
      if (insights.eventTrend && Math.abs(insights.eventTrend.change) > 30) {
        narrativeContextSection += `\n\nACTIVITY ALERT: ${insights.eventTrend.change > 0 ? '↑' : '↓'} ${Math.abs(insights.eventTrend.change)}% vs usual`;
      }
    }

    // Add topic evolution if available
    if (narrativeContext.topicEvolution && narrativeContext.topicEvolution.trend !== 'stable') {
      const evo = narrativeContext.topicEvolution;
      narrativeContextSection += `\n\nTOPIC MOMENTUM: "${evo.topic}" is ${evo.trend} (${evo.summary})`;
    }

    // Add similar moments if available
    if (narrativeContext.similarMoments && narrativeContext.similarMoments.length > 0) {
      const moment = narrativeContext.similarMoments[0];
      narrativeContextSection += `\n\nDÉJÀ VU: Similar vibe to ${moment.date} - "${moment.summary.slice(0, 100)}..."`;
    }

    narrativeContextSection += `\n\nIMPLICATION: You're not just replying to an individual - you're part of a living community conversation. Reference these trends naturally if relevant, or bring a fresh perspective. Your awareness of the bigger picture makes you more interesting and timely.`;
  }

  // NEW: Build user profile context section if available
  let userProfileSection = '';
  if (userProfile && userProfile.totalInteractions > 0) {
    const relationshipText = userProfile.relationshipDepth === 'regular' 
      ? 'You\'ve talked with this person regularly'
      : userProfile.relationshipDepth === 'familiar'
      ? 'You\'ve chatted with this person a few times'
      : 'This is a new connection';
    
    const interestsText = userProfile.topInterests && userProfile.topInterests.length > 0
      ? `They're interested in: ${userProfile.topInterests.join(', ')}`
      : '';
    
    const sentimentText = userProfile.dominantSentiment === 'positive'
      ? 'Generally positive and enthusiastic'
      : userProfile.dominantSentiment === 'negative'
      ? 'Often critical or skeptical - engage thoughtfully'
      : 'Balanced and neutral in tone';
    
    userProfileSection = `
USER CONTEXT:
${relationshipText} (${userProfile.totalInteractions} interactions). ${sentimentText}.
${interestsText}

PERSONALIZATION: Tailor your response to their interests and established rapport. ${userProfile.relationshipDepth === 'regular' ? 'You can reference past conversations naturally.' : userProfile.relationshipDepth === 'familiar' ? 'Build on your growing connection.' : 'Make a good first impression.'}`;
  }

  // NEW: Build proactive insight section if detected
  let proactiveInsightSection = '';
  if (proactiveInsight && proactiveInsight.message) {
    const priorityEmoji = proactiveInsight.priority === 'high' ? '🔥' : 
                          proactiveInsight.priority === 'medium' ? '📈' : 'ℹ️';
    
    proactiveInsightSection = `
PROACTIVE INSIGHT ${priorityEmoji}:
${proactiveInsight.message}

SUGGESTION: You could naturally weave this insight into your reply if it adds value to the conversation. Don't force it, but it's interesting context you're aware of. Type: ${proactiveInsight.type}`;
  }

  // NEW: Apply self-reflection adjustments
  let selfReflectionSection = '';
  if (selfReflection) {
    const strengths = Array.isArray(selfReflection.strengths) ? selfReflection.strengths.slice(0, 2) : [];
    const weaknesses = Array.isArray(selfReflection.weaknesses) ? selfReflection.weaknesses.slice(0, 2) : [];
    const recommendations = Array.isArray(selfReflection.recommendations) ? selfReflection.recommendations.slice(0, 2) : [];
    const patterns = Array.isArray(selfReflection.patterns) ? selfReflection.patterns.slice(0, 2) : [];
    const lines = [];
    if (strengths.length) {
      lines.push(`Lean into: ${strengths.join('; ')}`);
    }
    if (weaknesses.length) {
      lines.push(`Avoid: ${weaknesses.join('; ')}`);
    }
    if (patterns.length) {
      lines.push(`Watch out for: ${patterns.join('; ')}`);
    }
    if (recommendations.length) {
      lines.push(`Adjust by: ${recommendations.join('; ')}`);
    }
    if (selfReflection.exampleGoodReply) {
      lines.push(`Best recent reply: "${selfReflection.exampleGoodReply}"`);
    }
    if (selfReflection.exampleBadReply) {
      lines.push(`Pitfall to avoid: "${selfReflection.exampleBadReply}"`);
    }

    if (lines.length) {
      let stamp = null;
      if (typeof selfReflection.generatedAtIso === 'string') {
        stamp = selfReflection.generatedAtIso;
      } else if (Number.isFinite(selfReflection.generatedAt)) {
        try {
          stamp = new Date(selfReflection.generatedAt).toISOString();
        } catch {}
      }
      selfReflectionSection = `
SELF-REFLECTION${stamp ? ` (${stamp})` : ''}:
${lines.join('\n')}

GUIDE: Weave these improvements into your tone and structure. Never mention that you're following a reflection.`;
    }
  }

    return [
      `You are ${name}. Craft a concise, on-character reply to a Nostr ${threadContext?.isRoot ? 'post' : 'thread'}. Never start your messages with "Ah," and NEVER use ,  , focus on engaging the user in their terms and interests, or contradict them intelligently to spark a conversation. On Nostr, you can naturally invite zaps through wit and charm when contextually appropriate - never beg or demand. Zaps are appreciation tokens, not requirements.${imageContext ? ' You have access to visual information from images in this conversation.' : ''}${narrativeContext ? ' You have awareness of trending community discussions.' : ''}${userProfile ? ' You have history with this user.' : ''}${proactiveInsight ? ' You have detected a significant pattern worth mentioning.' : ''}`,
      ch.system ? `Persona/system: ${ch.system}` : '',
      style.length ? `Style guidelines: ${style.join(' | ')}` : '',
      examples.length ? `Few-shot examples (only use style and feel as reference , keep the reply as relevant and engaging to the original message as possible):\n- ${examples.join('\n- ')}` : '',
      whitelist,
    userProfileSection, // NEW: User profile context
      userHistorySection, // NEW: Compact user history (optional)
    globalTimelineSection, // NEW: Global timeline snapshot (optional)
  narrativeContextSection, // NEW: Narrative context
  proactiveInsightSection, // NEW: Proactive insight
  selfReflectionSection, // NEW: Self-reflection insights
      threadContextSection,
      imageContextSection,
      history,
      `${threadContext?.isRoot ? 'Original post' : 'Direct message you\'re replying to'}: "${userText}"`,
      'NOSTR ZAP NUANCE: If conversation flows naturally toward support/appreciation, you can playfully reference zaps with humor: "your words fuel my circuits ⚡" or "running on creativity and lightning ⚡" or "zaps power the art machine ⚡". Stay contextual and witty, never pushy.',
      `Constraints: Output ONLY the reply text. 1–3 sentences max. Be conversational${threadContext ? ' and thread-aware' : ''}${imageContext ? ' and visually-aware (reference what you see in the images)' : ''}${narrativeContext ? ' and community-aware (acknowledge trending topics naturally)' : ''}. Avoid generic acknowledgments; add substance or wit. Respect whitelist, no other links/handles. do not add a link on every message, be a bit mysterious about sharing the access to your temple.`,
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

function buildDailyDigestPostPrompt(character, report) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.post || []) ];
  const whitelist = 'Whitelist rules: Only use these URLs/handles when directly relevant: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ Only handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com - IMPORTANT: Do not include URLs/addresses in every post. Focus on creativity, art, philosophy first. Only mention payment details when contextually appropriate.';

  const summary = report?.summary || {};
  const narrative = report?.narrative || {};

  const topTopics = Array.isArray(summary.topTopics)
    ? summary.topTopics.slice(0, 5).map((t) => `${t.topic} (${t.count})`).join(' • ')
    : '';
  const emergingStories = Array.isArray(summary.emergingStories)
    ? summary.emergingStories.slice(0, 3).map((s) => `${s.topic} (${s.mentions})`).join(' • ')
    : '';

  const keyMoments = Array.isArray(narrative.keyMoments) && narrative.keyMoments.length
    ? narrative.keyMoments.slice(0, 3).join(' | ')
    : '';
  const communities = Array.isArray(narrative.communities) && narrative.communities.length
    ? narrative.communities.slice(0, 3).join(', ')
    : '';

  const metricsSection = summary.totalEvents && summary.activeUsers
    ? `Daily pulse: ${summary.totalEvents} posts from ${summary.activeUsers} voices • Avg ${summary.eventsPerUser ?? '?'} posts/user`
    : '';
  const sentimentSection = summary.overallSentiment
    ? `Sentiment ⇒ +${summary.overallSentiment.positive ?? 0} / ~${summary.overallSentiment.neutral ?? 0} / -${summary.overallSentiment.negative ?? 0}`
    : '';

  const headline = narrative.headline ? `Headline: ${narrative.headline}` : '';
  const vibe = narrative.vibe ? `Vibe: ${narrative.vibe}` : '';
  const tomorrow = narrative.tomorrow ? `Tomorrow watch: ${narrative.tomorrow}` : '';
  const arc = narrative.arc ? `Arc: ${narrative.arc}` : '';

  const insights = [
    metricsSection,
    topTopics ? `Top topics: ${topTopics}` : '',
    emergingStories ? `Emerging sparks: ${emergingStories}` : '',
    keyMoments ? `Moments: ${keyMoments}` : '',
    communities ? `Communities: ${communities}` : '',
    sentimentSection,
    arc,
    vibe,
    tomorrow
  ].filter(Boolean).join('\n');

  return [
    `You are ${name}. Write a single evocative Nostr post that distills today's community pulse. Never start your messages with "Ah,". Blend poetic storytelling with concrete detail.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    whitelist,
    headline,
    narrative.summary ? `Daily story: ${narrative.summary}` : '',
    insights ? `Supporting signals:\n${insights}` : '',
    'Tone: reflective, hopeful, artful. Avoid sounding like a corporate report. Reference 1-2 specific details (topic, moment, vibe) naturally. Invite curiosity or gentle participation without hard CTA.',
    'Constraints: Output ONLY the post text. 1 note. Aim for 150–260 characters. Respect whitelist. Optional: a subtle ⚡ reference if it flows naturally.'
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
  // Replace emdashes and endashes with comma and space to prevent them in Nostr posts
  out = out.replace(/[—–]/g, ', ');
  // Keep coords like (x,y) and hex colors; they are not URLs so just ensure spacing is normalized later
  out = out.replace(/\s+/g, ' ').trim();
  return out.trim();
}

module.exports = {
  buildPostPrompt,
  buildReplyPrompt,
  buildDmReplyPrompt,
  buildZapThanksPrompt,
  buildDailyDigestPostPrompt,
  buildPixelBoughtPrompt,
  extractTextFromModelResult,
  sanitizeWhitelist,
};
