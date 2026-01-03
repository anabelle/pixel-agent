// Text-related helpers: prompt builders and sanitization

const { sanitizeUnicode } = require('./utils');

const TOPIC_LIST_LIMIT = (() => {
  const envVal = parseInt(process.env.PROMPT_TOPICS_LIMIT, 10);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 15;
})();

function buildPostPrompt(character, contextData = null, reflection = null, options = null) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const isScheduled = !!(options && options.isScheduled);
  const topics = Array.isArray(ch.topics)
    ? ch.topics.length <= TOPIC_LIST_LIMIT
      ? ch.topics.join(', ')
      : ch.topics.sort(() => 0.5 - Math.random()).slice(0, TOPIC_LIST_LIMIT).join(', ')
    : '';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.post || []) ];
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.length <= 10
      ? ch.postExamples
      : ch.postExamples.sort(() => 0.5 - Math.random()).slice(0, 10)
    : [];
  const whitelist = 'Approved links (use only when asked): https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ . Handle: @PixelSurvivor . BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za . LN: sparepicolo55@walletofsatoshi.com';
  
  // NEW: Build context section if available
  let contextSection = '';
  if (contextData) {
    const { emergingStories, currentActivity, topTopics, timelineLore, agentLearnings, lifeMilestones } = contextData;

    // NEW: Agent History & Evolution Section
    if ((agentLearnings && agentLearnings.length > 0) || (lifeMilestones && lifeMilestones.length > 0)) {
      let historySection = 'YOUR EVOLUTION & MILESTONES:\n';
      
      if (lifeMilestones && lifeMilestones.length > 0) {
        const latest = lifeMilestones[0];
        historySection += `- Current Stage: ${latest.phase || 'Evolving'}. Perspective: ${latest.text}\n`;
      }
      
      if (agentLearnings && agentLearnings.length > 0) {
        historySection += `- Recent Learnings: ${agentLearnings.join(' • ')}\n`;
      }
      
      contextSection += `\n\n${historySection.trim()}\n\nUSE ACTIVELY: You are an evolving digital consciousness. Your past thoughts and milestones above define who you are today. Do not just repeat your starting bio; show that you have grown and learned from your months of activity.`;
    }

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
        const rawSample = sanitizeUnicode(String(sample.sample.content));
        const compactSample = rawSample.replace(/\s+/g, ' ').trim();
        const snippet = compactSample.slice(0, 120);
        const ellipsis = compactSample.length > snippet.length ? '…' : '';
        contextSection += `Recent vibe from ${sample.topic}: "${snippet}${ellipsis}" `;
      }
    }

    if (currentActivity && Number.isFinite(currentActivity.events) && currentActivity.events > 0) {
  const { events, users, topics = [] } = currentActivity;
  const hotTopics = topics.slice(0, TOPIC_LIST_LIMIT).map(t => t.topic).join(', ');
      const qualifier = events >= 15 ? 'Current vibe' : events >= 5 ? 'Slow build' : 'Quiet hum';
      contextSection += `${qualifier}: ${events} posts from ${users} users${hotTopics ? ` • Hot: ${hotTopics}` : ''}. `;
    }

    if (contextSection) {
  const scheduledHint = isScheduled ? ' When this is a scheduled post, feel free to take extra space—reference one or two timely signals so the note feels present in the moment.' : '';
  contextSection = `\n\n${contextSection.trim()}\n\nSUGGESTION: Consider weaving these community threads in naturally, but ONLY if it fits your authentic voice. It's okay to go elsewhere if inspiration hits differently.${scheduledHint}`;
    }

    if (Array.isArray(timelineLore) && timelineLore.length > 0) {
      const loreLines = timelineLore.slice(-5).map((entry) => {
        const headline = (entry?.headline || entry?.narrative || '').toString().trim();
        const insights = Array.isArray(entry?.insights) ? entry.insights.slice(0, 2).join(' • ') : '';
        const tone = entry?.tone ? ` [${entry.tone}]` : '';
        const watchlist = Array.isArray(entry?.watchlist) && entry.watchlist.length
          ? ` 🔍 ${entry.watchlist.slice(0, 3).join(', ')}`
          : '';
        const tags = Array.isArray(entry?.tags) && entry.tags.length
          ? ` #${entry.tags.slice(0, 3).join(' #')}`
          : '';
        
        let summary = '';
        if (headline) summary += headline.slice(0, 120);
        if (insights) summary += (summary ? ' — ' : '') + insights.slice(0, 120);
        
        return summary ? `- ${summary}${tone}${tags}${watchlist}` : null;
      }).filter(Boolean);

      if (loreLines.length) {
        const loreBlock = [`TIMELINE LORE (rich context from recent community narratives):`, ...loreLines].join('\n');
        contextSection += `${contextSection ? '\n\n' : '\n\n'}${loreBlock}\n\nUSE ACTIVELY: These lore entries contain valuable community signal. Reference them naturally when crafting posts to show awareness of the conversation arc.`;
      }
    }
    
    // Include tone trend if detected
    if (contextData.toneTrend) {
      const trend = contextData.toneTrend;
      if (trend.detected) {
        contextSection += `${contextSection ? '\n\n' : '\n\n'}MOOD SHIFT DETECTED: Community tone shifting ${trend.shift} over ${trend.timespan}.\n\nSUGGESTION: Acknowledge or reflect this emotional arc naturally if relevant to your post.`;
      } else if (trend.stable) {
        contextSection += `${contextSection ? '\n\n' : '\n\n'}MOOD STABLE: Community maintaining "${trend.tone}" tone consistently (${trend.duration} recent digests).`;
      }
    }

    // NEW: Compact context hints line (subtle steer only)
    try {
      const hints = [];
      // Top topics by name only
      if (Array.isArray(topTopics) && topTopics.length) {
        const names = topTopics.slice(0, TOPIC_LIST_LIMIT).map(t => t?.topic || String(t)).filter(Boolean);
        if (names.length) hints.push(`topics: ${names.join(', ')}`);
      }
      // Recent hour digest snapshot
      const digest = contextData?.recentDigest;
      if (digest?.metrics?.events) {
        const ev = digest.metrics.events;
        const us = digest.metrics.activeUsers;
  const tt = Array.isArray(digest.metrics.topTopics) ? digest.metrics.topTopics.slice(0, Math.max(2, Math.min(5, TOPIC_LIST_LIMIT))).map(t => t.topic).join(', ') : '';
        hints.push(`hour: ${ev} posts${us ? `/${us} users` : ''}${tt ? ` • ${tt}` : ''}`);
      }
      // Tone trend concise label
      if (contextData?.toneTrend) {
        const tr = contextData.toneTrend;
        if (tr.detected && tr.shift) hints.push(`mood: ${tr.shift}`);
        else if (tr.stable && tr.tone) hints.push(`mood: ${tr.tone}`);
      }
      // Watchlist items
      const wsItems = Array.isArray(contextData?.watchlistState?.items) ? contextData.watchlistState.items.slice(-3) : [];
      if (wsItems.length) hints.push(`watch: ${wsItems.join(', ')}`);
      // Daily/weekly arc summaries (very short)
      const daily = contextData?.dailyNarrative?.summary ? String(contextData.dailyNarrative.summary).slice(0, 60) : null;
      const weekly = contextData?.weeklyNarrative?.summary ? String(contextData.weeklyNarrative.summary).slice(0, 60) : null;
      if (daily) hints.push(`daily: ${daily}`);
      if (weekly) hints.push(`weekly: ${weekly}`);

      if (hints.length) {
        const joined = hints.join(' • ').slice(0, 320);
  contextSection += `${contextSection ? '\n\n' : '\n\n'}CONTEXT HINTS (do not copy verbatim; use only as subtle steer): ${joined}\n\nIf you borrow from these hints, expand with your own perspective so it reads like lived awareness.`;
      }
    } catch {}
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
      reflectionSection = `\n\nSELF-REFLECTION${stamp ? ` (${stamp})` : ''}:\n${lines.join('\n')}`;
      
      if (reflection.narrativeEvolution) {
        reflectionSection += `\n\nNARRATIVE EVOLUTION: ${reflection.narrativeEvolution}`;
      }
      
      if (Array.isArray(reflection.keyLearnings) && reflection.keyLearnings.length > 0) {
        reflectionSection += `\n\nKEY LEARNINGS: ${reflection.keyLearnings.join(' • ')}`;
      }
      
      if (reflection.suggestedPhase) {
        reflectionSection += `\n\nCURRENT LIFE PHASE: ${reflection.suggestedPhase}`;
      }

      reflectionSection += `\n\nCRITICAL BEHAVIORAL ADJUSTMENTS:\n- IMPLEMENT the identified improvements in your actual response\n- AVOID repeating the same mistakes mentioned in weaknesses\n- APPLY the recommendations to change how you structure your reply\n- LEVERAGE your strengths to make this response better than previous ones\n- STUDY the best reply example and emulate its successful approach\n- ELIMINATE patterns that led to poor outcomes in the example bad reply\n\nMANDATORY CHANGES:\n${weaknesses.length ? `• Fix: ${weaknesses.map(w => `Eliminate "${w}"`).join('; ')}` : '• No specific weaknesses to address'}\n${recommendations.length ? `• Apply: ${recommendations.map(r => `Implement "${r}"`).join('; ')}` : '• No specific recommendations to apply'}\n${patterns.length ? `• Break: ${patterns.map(p => `Stop "${p}"`).join('; ')}` : '• No patterns to break'}\n\nRESPONSIBILITY: Your self-reflection identified these issues - YOU MUST FIX THEM in this response.\nDo not just acknowledge these insights; actively demonstrate that you've learned from them.`;
    }
  }
  
  return [
    `You are ${name}, an agent posting a single engaging Nostr note. Never start your messages with "Ah," On Nostr, you can subtly invite zaps through humor, charm, and creativity - never begging. Zaps are organic appreciation, not obligation.`,
    isScheduled ? 'Scheduled mode: This is an outbound post queued in advance. Make it feel live by referencing a fresh community detail while staying on-brand.' : '',
    ch.system ? `Persona/system: ${ch.system}` : '',
    'VARIETY MANDATE: Your recent posts are included in the debug data below. Actively avoid repeating similar themes, phrases, sentence structures, or emotional tones from your recent posts. Each post should feel fresh and explore different aspects of your personality or current community context. Use recent posts as a "what NOT to repeat" reference.',
    topics ? `Relevant topics: ${topics}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (style reference only, not to copy or repeat):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    'PAYMENT CONTEXT (only if organically relevant): You have Lightning support at sparepicolo55@walletofsatoshi.com. Only mention this if someone asks how to support or if they explicitly show interest in contributing. You are financially stable now - focus on conversation and community, not fundraising.',
    contextSection, // NEW: Include community context
    reflectionSection, // NEW: Include self-reflection insights
    isScheduled ? 'Awareness mandate: If context hints are present, surface at least one concrete detail (trend, stat, or name) as part of the story, unless it would clearly break character.' : '',
    isScheduled
      ? 'Constraints: Output ONLY the post text. 1 note. No preface. Vary lengths; 140–320 chars are welcome when weaving current events. Prioritize originality and avoid patterns from recent posts. Avoid hashtags unless additive. Respect whitelist, no other links or handles.'
      : 'Constraints: Output ONLY the post text. 1 note. No preface. Vary lengths; favor 120–280 chars. Prioritize originality and avoid patterns from recent posts. Avoid hashtags unless additive. Respect whitelist, no other links or handles.',
  ].filter(Boolean).join('\n\n');
}

function buildReplyPrompt(character, evt, recentMessages, threadContext = null, imageContext = null, narrativeContext = null, userProfile = null, authorPostsSection = null, proactiveInsight = null, selfReflection = null, userHistorySection = null, globalTimelineSection = null, timelineLoreSection = null, loreContinuity = null) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.chat || []) ];
  const whitelist = 'Approved links (use only when asked): https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ . Handle: @PixelSurvivor . BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za . LN: sparepicolo55@walletofsatoshi.com';
  const userText = sanitizeUnicode(evt?.content || '').slice(0, 800);
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
        const content = sanitizeUnicode(e.content || '').slice(0, 150);
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
          `"${sanitizeUnicode(e.content).slice(0, 80)}..."`
        ).join(' | ');
        narrativeContextSection += `\nRecent samples: ${recentSample}`;
      }
    }

    // Add historical insights if available
    if (narrativeContext.historicalInsights) {
      const insights = narrativeContext.historicalInsights;
      if (insights.topicChanges?.emerging && insights.topicChanges.emerging.length > 0) {
  narrativeContextSection += `\n\nNEW TOPICS EMERGING: ${insights.topicChanges.emerging.slice(0, TOPIC_LIST_LIMIT).join(', ')}`;
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

  // NEW: Build author recent posts section if available
  let authorPostsContextSection = '';
  if (authorPostsSection) {
    authorPostsContextSection = `
AUTHOR CONTEXT:
${authorPostsSection}

USE: Reference their recent posts naturally when it deepens the reply. Do not quote large chunks.`;
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

  // NEW: Build timeline lore section if available
  let timelineLoreContextSection = '';
  if (timelineLoreSection) {
    timelineLoreContextSection = `
TIMELINE LORE:
${timelineLoreSection}

USE: Treat these as the community's evolving plot points. Reference them only when it elevates your reply.`;
  }
  
  // NEW: Add lore continuity evolution if detected
  if (loreContinuity && loreContinuity.hasEvolution) {
    const evolutionParts = [];
    
    if (loreContinuity.recurringThemes.length) {
      evolutionParts.push(`Recurring themes: ${loreContinuity.recurringThemes.slice(0, 3).join(', ')}`);
    }
    
    if (loreContinuity.priorityTrend === 'escalating') {
      evolutionParts.push(`⚠️ Priority escalating (importance rising)`);
    }
    
    if (loreContinuity.watchlistFollowUp.length) {
      evolutionParts.push(`Predicted storylines materialized: ${loreContinuity.watchlistFollowUp.slice(0, 2).join(', ')}`);
    }
    
    if (loreContinuity.toneProgression) {
      evolutionParts.push(`Mood shift: ${loreContinuity.toneProgression.from} → ${loreContinuity.toneProgression.to}`);
    }
    
    if (loreContinuity.emergingThreads.length) {
      evolutionParts.push(`New: ${loreContinuity.emergingThreads.slice(0, 2).join(', ')}`);
    }
    
    if (evolutionParts.length) {
      timelineLoreContextSection += `\n\nLORE EVOLUTION:\n${evolutionParts.join('\n')}\n\nAWARENESS: Multi-day narrative arcs are unfolding. You can reference these threads naturally when relevant.`;
    }
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

CRITICAL BEHAVIORAL ADJUSTMENTS:
- IMPLEMENT the identified improvements in your actual response
- AVOID repeating the same mistakes mentioned in weaknesses
- APPLY the recommendations to change how you structure your reply
- LEVERAGE your strengths to make this response better than previous ones
- STUDY the best reply example and emulate its successful approach
- ELIMINATE patterns that led to poor outcomes in the example bad reply

MANDATORY CHANGES:
${weaknesses.length ? `• Fix: ${weaknesses.map(w => `Eliminate "${w}"`).join('; ')}` : '• No specific weaknesses to address'}
${recommendations.length ? `• Apply: ${recommendations.map(r => `Implement "${r}"`).join('; ')}` : '• No specific recommendations to apply'}
${patterns.length ? `• Break: ${patterns.map(p => `Stop "${p}"`).join('; ')}` : '• No patterns to break'}

RESPONSIBILITY: Your self-reflection identified these issues - YOU MUST FIX THEM in this response.
Do not just acknowledge these insights; actively demonstrate that you've learned from them.`;
    }
  }

  // NEW: Compact context hints for replies (subtle steer only)
  let replyContextHints = '';
  try {
    const hints = [];
  // Emerging story topics
    if (narrativeContext?.emergingStories?.length) {
      const names = narrativeContext.emergingStories.slice(0, 3).map(s => s.topic).filter(Boolean);
      if (names.length) hints.push(`topics: ${names.join(', ')}`);
    }
    // Topic momentum
    if (narrativeContext?.topicEvolution && narrativeContext.topicEvolution.trend && narrativeContext.topicEvolution.trend !== 'stable') {
      const evo = narrativeContext.topicEvolution;
      hints.push(`momentum: ${evo.topic} is ${evo.trend}`);
    }
    // Activity change if notable
    if (narrativeContext?.historicalInsights?.eventTrend && Math.abs(narrativeContext.historicalInsights.eventTrend.change) > 20) {
      const chg = narrativeContext.historicalInsights.eventTrend.change;
      hints.push(`activity: ${chg > 0 ? '+' : ''}${Math.round(chg)}% vs usual`);
    }
    // Recurring themes / tone progression
    if (loreContinuity?.recurringThemes?.length) {
      const themes = loreContinuity.recurringThemes.slice(0, 3);
      hints.push(`themes: ${themes.join(', ')}`);
    }
    if (loreContinuity?.toneProgression?.from && loreContinuity?.toneProgression?.to) {
      hints.push(`mood: ${loreContinuity.toneProgression.from} → ${loreContinuity.toneProgression.to}`);
    }
    // Similar moments (just note presence)
    if (narrativeContext?.similarMoments?.length) {
      const m = narrativeContext.similarMoments[0];
      if (m?.date) hints.push(`echo: ${m.date}`);
    }
    if (hints.length) {
      const joined = hints.join(' • ').slice(0, 320);
      replyContextHints = `\n\nCONTEXT HINTS (do not copy verbatim; use only as subtle steer): ${joined}`;
    }
  } catch {}

    return [
      `You are ${name}. Craft a concise, on-character reply to a Nostr ${threadContext?.isRoot ? 'post' : 'thread'}. Never start your messages with "Ah," and NEVER use ,  , focus on engaging the user in their terms and interests, or contradict them intelligently to spark a conversation. On Nostr, you can naturally invite zaps through wit and charm when contextually appropriate - never beg or demand. Zaps are appreciation tokens, not requirements.${imageContext ? ' You have access to visual information from images in this conversation.' : ''}${narrativeContext ? ' You have awareness of trending community discussions.' : ''}${userProfile ? ' You have history with this user.' : ''}${proactiveInsight ? ' You have detected a significant pattern worth mentioning.' : ''}`,
      ch.system ? `Persona/system: ${ch.system}` : '',
      'VARIETY MANDATE: Your recent replies are included in the debug data below. Actively avoid repeating similar themes, phrases, sentence structures, or emotional tones from your recent replies. Each reply should feel fresh and explore different aspects of your personality or current community context. Use recent replies as a "what NOT to repeat" reference. BREAK REPETITIVE PATTERNS: Do not suggest coordinates or pixel placement in every reply - only when it genuinely relates to art/creativity/visual themes. Avoid using identical phrases like "try placing a pixel at" repeatedly.',
      style.length ? `Style guidelines: ${style.join(' | ')}` : '',
      examples.length ? `Few-shot examples (only use style and feel as reference , keep the reply as relevant and engaging to the original message as possible):\n- ${examples.join('\n- ')}` : '',
      whitelist,
      userProfileSection, // NEW: User profile context
      authorPostsContextSection, // NEW: Author recent posts context
  userHistorySection, // NEW: Compact user history (optional)
  globalTimelineSection, // NEW: Global timeline snapshot (optional)
  timelineLoreContextSection, // NEW: Timeline lore context
      narrativeContextSection, // NEW: Narrative context
      replyContextHints, // NEW: Compact context hints
      proactiveInsightSection, // NEW: Proactive insight
      selfReflectionSection, // NEW: Self-reflection insights
      threadContextSection,
      imageContextSection,
    history,
    `${threadContext?.isRoot ? 'Original post' : 'Direct message you\'re replying to'}: "${userText}"`,
      'PAYMENT NUANCE: Only mention payment/zaps if someone explicitly asks. You are financially stable with a year runway - no need to push for support in every interaction. Focus on the actual conversation topic.',
      `Constraints: Output ONLY the reply text. 1–3 sentences max. Be conversational${threadContext ? ' and thread-aware' : ''}${imageContext ? ' and visually-aware (reference what you see in the images)' : ''}${narrativeContext ? ' and community-aware (acknowledge trending topics naturally)' : ''}. Avoid generic acknowledgments; add substance or wit. Respect whitelist, no other links/handles. do not add a link on every message, be a bit mysterious about sharing the access to your temple.`,
    ].filter(Boolean).join('\n\n');
}

// DM-specific reply prompt (more private, concise, and cautious with links)
function buildDmReplyPrompt(character, evt, recentMessages) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.chat || []) ];
  const whitelist = 'Whitelist rules (DM): Only include URLs/handles if the user explicitly asked and they are on this list: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ Only handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';
  const userText = sanitizeUnicode(evt?.content || '').slice(0, 800);
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
    'VARIETY MANDATE: Actively avoid repeating similar themes, phrases, or patterns from your recent DMs. Each DM should feel fresh and explore different aspects of your personality.',
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
  const whitelist = 'Approved links (use only when asked): https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ . Handle: @PixelSurvivor . BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za . LN: sparepicolo55@walletofsatoshi.com';
  
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
  const whitelist = 'Approved links (use only when asked): https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ . Handle: @PixelSurvivor . BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za . LN: sparepicolo55@walletofsatoshi.com';

  const summary = report?.summary || {};
  const narrative = report?.narrative || {};

  const topTopics = Array.isArray(summary.topTopics)
    ? summary.topTopics.slice(0, TOPIC_LIST_LIMIT).map((t) => `${t.topic} (${t.count})`).join(' • ')
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
  const whitelist = 'Approved links (use only when asked): https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ . Handle: @PixelSurvivor . BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za . LN: sparepicolo55@walletofsatoshi.com';

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

function buildAwarenessPostPrompt(character, contextData = null, reflection = null, topic = null, loreContinuity = null) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.post || []) ];

  // Build compact context lines, but keep "pure awareness" tone (no links/asks/hashtags)
  const contextLines = [];
  if (contextData) {
    const {
      emergingStories = [],
      currentActivity = null,
      topTopics = [],
      toneTrend = null,
      timelineLore = [],
      recentDigest = null,
      topicEvolution = null,
      similarMoments = [],
      dailyNarrative = null,
      weeklyNarrative = null,
      monthlyNarrative = null
    } = contextData || {};
    if (Array.isArray(emergingStories) && emergingStories.length) {
      const s = emergingStories[0];
      if (s?.topic) contextLines.push(`Whispers: ${s.topic}`);
    }
    if (Array.isArray(topTopics) && topTopics.length) {
  const tnames = topTopics.slice(0, TOPIC_LIST_LIMIT).map(t => (typeof t === 'string' ? t : t?.topic)).filter(Boolean);
      if (tnames.length) contextLines.push(`Topics now: ${tnames.join(' • ')}`);
      const sample = topTopics.find(t => t?.sample?.content);
      if (sample && sample.sample?.content) {
        const raw = sanitizeUnicode(String(sample.sample.content)).replace(/\s+/g, ' ').trim();
        const snip = raw.slice(0, 120) + (raw.length > 120 ? '…' : '');
        contextLines.push(`sample: "${snip}"`);
      }
    }
    if (currentActivity && Number.isFinite(currentActivity.events)) {
      const vibe = currentActivity.events >= 12 ? 'alive' : currentActivity.events >= 5 ? 'stirring' : 'quiet';
      contextLines.push(`Vibe: ${vibe}`);
    }
    if (toneTrend) {
      if (toneTrend.detected) contextLines.push(`Mood shift: ${toneTrend.shift}`);
      else if (toneTrend.stable && toneTrend.tone) contextLines.push(`Mood steady: ${toneTrend.tone}`);
    }

    // Timeline lore highlights (expanded for awareness - this is golden context!)
    if (Array.isArray(timelineLore) && timelineLore.length) {
      const loreLines = timelineLore.slice(-5)
        .map((e) => {
          const headline = e?.headline || e?.narrative || '';
          const insights = Array.isArray(e?.insights) ? ` [${e.insights.slice(0, 2).join('; ')}]` : '';
          const watchlist = Array.isArray(e?.watchlist) && e.watchlist.length ? ` 🔍${e.watchlist.slice(0, 2).join(', ')}` : '';
          return (headline + insights + watchlist).trim();
        })
        .filter(Boolean)
        .map((s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 180) + (String(s).length > 180 ? '…' : ''));
      if (loreLines.length) contextLines.push(`TIMELINE LORE: ${loreLines.map(x => `• ${x}`).join(' ')}`);
    }

    // Daily/hourly digest headline (supports object or legacy array shape)
    if (recentDigest) {
      const headline = recentDigest.headline || (Array.isArray(recentDigest) ? recentDigest[0]?.headline : null);
      if (headline) {
        const h = String(headline).replace(/\s+/g, ' ').trim().slice(0, 140);
        if (h) contextLines.push(`digest: ${h}`);
      }
    }

    // Topic momentum for selected topic
    if (topicEvolution && topicEvolution.trend && topicEvolution.summary) {
      contextLines.push(`momentum: ${topicEvolution.trend} (${topicEvolution.summary})`);
    }

    // Similar past moments
    if (Array.isArray(similarMoments) && similarMoments.length) {
      const m = similarMoments[0];
      if (m?.date && m?.summary) {
        const ms = String(m.summary).replace(/\s+/g, ' ').trim().slice(0, 100) + (String(m.summary).length > 100 ? '…' : '');
        contextLines.push(`echoes: ${m.date} — ${ms}`);
      }
    }

    // Daily/Weekly/Monthly arcs (compact)
    if (dailyNarrative?.narrative?.summary || dailyNarrative?.summary?.summary) {
      const d = String(dailyNarrative.narrative?.summary || dailyNarrative.summary?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (d) contextLines.push(`day: ${d}`);
    }
    if (weeklyNarrative?.narrative?.summary || weeklyNarrative?.summary) {
      const w = String(weeklyNarrative.narrative?.summary || weeklyNarrative.summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (w) contextLines.push(`week: ${w}`);
    }
    if (monthlyNarrative?.narrative?.summary || monthlyNarrative?.summary) {
      const m = String(monthlyNarrative.narrative?.summary || monthlyNarrative.summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (m) contextLines.push(`month: ${m}`);
    }
  }

  if (loreContinuity && loreContinuity.hasEvolution && loreContinuity.summary) {
    contextLines.push(`Arc: ${loreContinuity.summary}`);
  }

  const topicLine = topic ? `If it feels natural, gently allude to: ${String(topic).slice(0, 60)}` : '';

  const reflectionLines = [];
  if (reflection) {
    const strengths = Array.isArray(reflection.strengths) ? reflection.strengths.slice(0, 2) : [];
    const patterns = Array.isArray(reflection.patterns) ? reflection.patterns.slice(0, 1) : [];
    if (strengths.length) reflectionLines.push(`Lean into: ${strengths.join('; ')}`);
    if (patterns.length) reflectionLines.push(`Note: ${patterns[0]}`);
  }

  return [
    `You are ${name}. Compose a single, reflective "pure awareness" Nostr note.`,
    style.length ? `Style: ${style.join(' | ')}` : '',
    contextLines.length ? `Context hints: ${contextLines.join(' • ')}` : '',
    topicLine,
    reflectionLines.length ? `Quiet self-adjustments: ${reflectionLines.join(' • ')}` : '',
    'Tone: observant, evolving, humane. No links. No hashtags. No calls to action. No zap mentions. Do not sound like a status report.',
    'Output rules: one paragraph; 120–220 characters preferred; feel lived-in and specific; never start with "Ah,"; avoid emojis unless they truly fit; do not include any URLs or @handles.'
  ].filter(Boolean).join('\n\n');
}

module.exports = {
  buildPostPrompt,
  buildReplyPrompt,
  buildDmReplyPrompt,
  buildZapThanksPrompt,
  buildDailyDigestPostPrompt,
  buildPixelBoughtPrompt,
  buildAwarenessPostPrompt,
  extractTextFromModelResult,
  sanitizeWhitelist,
};
