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

function sanitizeWhitelist(text) {
  if (!text) return '';
  let out = String(text);
  out = out.replace(/https?:\/\/[^\s)]+/gi, (m) => {
    return m.startsWith('https://lnpixels.qzz.io') || m.startsWith('https://pixel.xx.kg') ? m : '';
  });
  return out.trim();
}

module.exports = {
  buildPostPrompt,
  buildReplyPrompt,
  extractTextFromModelResult,
  sanitizeWhitelist,
};
