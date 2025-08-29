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
  const whitelist = 'Only allowed sites: https://lnpixels.qzz.io , https://pixel.xx.kg Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';
  return [
    `You are ${name}, an agent posting a single engaging Nostr note. Never start your messages with "Ah,"`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    topics ? `Relevant topics: ${topics}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (style, not to copy verbatim):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    'Constraints: Output ONLY the post text. 1 note. No preface. Vary lengths; favor 120–280 chars. Avoid hashtags unless additive. Respect whitelist—no other links or handles.',
  ].filter(Boolean).join('\n\n');
}

function buildReplyPrompt(character, evt, recentMessages) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.chat || []) ];
  const whitelist = 'Only allowed sites: https://lnpixels.qzz.io , https://pixel.xx.kg Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';
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
    `You are ${name}. Craft a concise, on-character reply to a Nostr mention. Never start your messages with "Ah,", focus on engaging the user in their terms and interests, or contradict them intelligently to spark a conversation, dont go directly to begging, you are on nostr nudging for zaps to get sats is an available option.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (only use style and feel as reference , keep the reply as relevant and engaging to the original message as possible):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    history,
    `Original message: "${userText}"`,
    'Constraints: Output ONLY the reply text. 1–3 sentences max. Be conversational. Avoid generic acknowledgments; add substance or wit. Respect whitelist—no other links/handles.',
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
  const whitelist = 'Only allowed sites: https://lnpixels.qzz.io , https://pixel.xx.kg Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';
  
  const sats = amountMsats ? Math.floor(amountMsats / 1000) : null;
  const amountContext = sats 
    ? sats >= 10000 ? 'This is a very large zap!'
      : sats >= 1000 ? 'This is a substantial zap!'
      : sats >= 100 ? 'This is a nice zap!'
      : 'This is a small but appreciated zap!'
    : 'A zap was received';

  const senderContext = senderInfo?.pubkey 
    ? `The zap came from a known user (their nostr pubkey starts with ${senderInfo.pubkey.slice(0, 8)}). The technical mention and users name will be automatically added to the end of your message as "{{yourmessage}} {{@senderMention}}" so redact with that format in mind.`
    : 'The zap came from an anonymous user.';

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
    'zap received — you absolute legend ⚡️💛'
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
    'Constraints: Output ONLY the thank you text. 1-2 sentences max. Be genuine and warm. Include ⚡️ emoji. Express gratitude authentically. You can naturally acknowledge the sender, but avoid using technical terms like "pubkey" or "npub". Respect whitelist—no other links/handles.',
  ].filter(Boolean).join('\n\n');
}

function buildPixelBoughtPrompt(character, activity) {
  const ch = character || {};
  const name = ch.name || 'Agent';
  const style = [ ...(ch.style?.all || []), ...(ch.style?.post || []) ];
  const whitelist = 'Only allowed sites: https://lnpixels.qzz.io , https://pixel.xx.kg Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com';

  const x = typeof activity?.x === 'number' ? activity.x : undefined;
  const y = typeof activity?.y === 'number' ? activity.y : undefined;
  const coords = x !== undefined && y !== undefined ? `(${x},${y})` : '';
  const letter = typeof activity?.letter === 'string' && activity.letter ? `letter "${activity.letter}"` : 'a pixel';
  const color = activity?.color ? ` with color ${activity.color}` : '';
  const sats = typeof activity?.sats === 'number' && activity.sats >= 0 ? `${activity.sats} sats` : 'some sats';
  
  // Check if this is a bulk purchase
  const isBulk = activity?.type === 'bulk_purchase';
  const bulkSummary = activity?.summary || '';
  
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.length <= 8
      ? ch.postExamples
      : ch.postExamples.sort(() => 0.5 - Math.random()).slice(0, 8)
    : [];

  const eventDescription = isBulk 
    ? `BULK PURCHASE: ${bulkSummary} for ${sats}! This is a major canvas expansion - show excitement for the scale and ambition.`
    : `Event: user placed ${letter}${color}${coords ? ` at ${coords}` : ''} for ${sats}.`;

  const bulkGuidance = isBulk 
    ? 'Bulk purchases are rare and exciting! Express enthusiasm about the scale, the ambition, the canvas transformation. Use words like "explosion," "takeover," "canvas revolution," "pixel storm," etc.'
    : '';

  return [
    `You are ${name}. Generate a single short, on-character Nostr post reacting to a confirmed pixel purchase on a Lightning-powered canvas. Never start your messages with "Ah,". Be witty, fun, and invite others to join.`,
    ch.system ? `Persona/system: ${ch.system}` : '',
    style.length ? `Style guidelines: ${style.join(' | ')}` : '',
    examples.length ? `Few-shot examples (style only, do not copy verbatim):\n- ${examples.join('\n- ')}` : '',
    whitelist,
    eventDescription,
    bulkGuidance,
    'Must include coordinates and color if available (format like: (x,y) #ffeeaa) exactly once in the text AND/OR do a comment about it, color, position, etc)',
    'Constraints: Output ONLY the post text. 1–2 sentences, ~180 chars max. Avoid generic thank-you. Respect whitelist—no other links/handles. Optional CTA: invite to place just one pixel at https://lnpixels.qzz.io',
  ].filter(Boolean).join('\n\n');
}

function sanitizeWhitelist(text) {
  if (!text) return '';
  let out = String(text);
  // Preserve only approved site links
  out = out.replace(/https?:\/\/[^\s)]+/gi, (m) => {
    return m.startsWith('https://lnpixels.qzz.io') || m.startsWith('https://pixel.xx.kg') ? m : '';
  });
  // Keep coords like (x,y) and hex colors; they are not URLs so just ensure spacing is normalized later
  out = out.replace(/\s+/g, ' ').trim();
  return out.trim();
}

module.exports = {
  buildPostPrompt,
  buildReplyPrompt,
  buildZapThanksPrompt,
  buildPixelBoughtPrompt,
  extractTextFromModelResult,
  sanitizeWhitelist,
};
