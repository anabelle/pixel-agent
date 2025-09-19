// Engagement scoring and content quality helpers extracted for testability

function _scoreEventForEngagement(evt, nowSec = Math.floor(Date.now() / 1000)) {
  if (!evt || !evt.content) return 0;
  const text = String(evt.content);
  const age = nowSec - (evt.created_at || 0);
  const ageHours = age / 3600;
  let score = 0;
  if (text.length >= 20 && text.length <= 280) score += 0.3;
  else if (text.length > 280 && text.length <= 500) score += 0.2;
  else if (text.length < 20) score -= 0.2;
  else if (text.length > 1000) score -= 0.3;
  if (/\?/.test(text)) score += 0.3;
  if (/[!]{1,2}/.test(text) && !/[!]{3,}/.test(text)) score += 0.2;
  if (/(?:what|how|why|when|where)\b/i.test(text)) score += 0.2;
  if (/(?:think|feel|believe|opinion|thoughts)/i.test(text)) score += 0.2;
  const pixelInterests = [
    /(?:pixel|art|creative|canvas|paint|draw)/i,
    /(?:bitcoin|lightning|sats|zap|value4value)/i,
    /(?:nostr|relay|decentralized|freedom)/i,
    /(?:code|program|build|create|make)/i,
    /(?:collaboration|community|together|share)/i,
  ];
  pixelInterests.forEach((pattern) => {
    if (pattern.test(text)) score += 0.15;
  });
  if (/(?:thoughts on|opinion about|anyone else|does anyone|has anyone)/i.test(text)) score += 0.25;
  if (/(?:looking for|seeking|need help|advice|recommendations)/i.test(text)) score += 0.2;
  const hasETag = Array.isArray(evt.tags) && evt.tags.some((tag) => tag[0] === 'e');
  if (hasETag) score += 0.1;
  const mentions = (text.match(/(^|\s)@[A-Za-z0-9_\.:-]+/g) || []).length;
  if (mentions === 1) score += 0.1;
  else if (mentions === 2) score += 0.05;
  else if (mentions > 3) score -= 0.3;
  const hashtags = (text.match(/#\w+/g) || []).length;
  if (hashtags === 1 || hashtags === 2) score += 0.05;
  else if (hashtags > 5) score -= 0.2;
  const botPatterns = [
    /^(gm|good morning|good night|gn)\s*$/i,
    /follow me|follow back/i,
    /check out|click here|link in bio/i,
    /(?:buy|sell|trade).*(?:crypto|bitcoin|coin)/i,
    /(?:pump|moon|lambo|hodl|diamond hands)\s*$/i,
    /\b(?:dm|pm)\s+me\b/i,
  ];
  if (botPatterns.some((pattern) => pattern.test(text))) {
    score -= 0.5;
  }
  if (ageHours < 0.5) score -= 0.3;
  else if (ageHours < 2) score += 0.2;
  else if (ageHours < 6) score += 0.1;
  else if (ageHours > 12) score -= 0.1;
  else if (ageHours > 24) score -= 0.3;
  score += (Math.random() - 0.5) * 0.1;
  return Math.max(0, Math.min(1, score));
}

function _isQualityContent(event, topic = '') {
  if (!event || !event.content) return false;
  const content = event.content;

  // Check for inappropriate content
  const blockedKeywords = [
    'pedo', 'pedophile', 'child', 'minor', 'underage', 'cp', 'csam',
    'rape', 'abuse', 'exploitation', 'grooming', 'loli', 'shota'
  ];
  const lowerContent = content.toLowerCase();
  if (blockedKeywords.some(keyword => lowerContent.includes(keyword))) {
    return false;
  }

  const contentLength = content.length;
  if (contentLength < 10) return false;
  if (contentLength > 2000) return false;
  const botPatterns = [
    /^(gm|good morning|hello|hi)\s*$/i,
    /follow me|follow back|mutual follow/i,
    /check out my|visit my|buy my/i,
    /click here|link in bio/i,
    /\$\d+.*(?:airdrop|giveaway|free)/i,
    /(?:join|buy|sell).*(?:telegram|discord)/i,
    /(?:pump|moon|lambo|hodl)\s*$/i,
    /^\d+\s*(?:sats|btc|bitcoin)\s*$/i,
    /(?:repost|rt|share)\s+if/i,
    /\b(?:dm|pm)\s+me\b/i,
    /(?:free|earn).*(?:bitcoin|crypto|money)/i,
  ];
  if (botPatterns.some((pattern) => pattern.test(content))) return false;
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 3) return false;
  const uniqueWords = new Set(content.toLowerCase().split(/\s+/)).size;
  const wordVariety = uniqueWords / wordCount;
  if (wordVariety < 0.5 && wordCount > 5) return false;
  const qualityIndicators = [
    /\?/,
    /[.!?]{2,}/,
    /(?:think|feel|believe|wonder|curious)/i,
    /(?:create|build|make|design|art|work)/i,
    /(?:experience|learn|try|explore)/i,
    /(?:community|together|collaborate|share)/i,
    /(?:nostr|bitcoin|lightning|zap|sat)/i,
  ];
  let qualityScore = qualityIndicators.reduce((score, indicator) => score + (indicator.test(content) ? 1 : 0), 0);
  const isArtTopic = /art|pixel|creative|canvas|design|visual/.test(topic.toLowerCase());
  const isTechTopic = /dev|code|programming|node|typescript|docker/.test(topic.toLowerCase());
  if (isArtTopic) {
    const artTerms = /(?:color|paint|draw|sketch|canvas|brush|pixel|create|art|design|visual|aesthetic)/i;
    if (artTerms.test(content)) qualityScore += 1;
  }
  if (isTechTopic) {
    const techTerms = /(?:code|program|build|develop|deploy|server|node|docker|git|open source)/i;
    if (techTerms.test(content)) qualityScore += 1;
  }
  const now = Math.floor(Date.now() / 1000);
  const age = now - (event.created_at || 0);
  const ageHours = age / 3600;
  if (ageHours < 0.5) return false;
  if (ageHours > 12) qualityScore -= 1;
  return qualityScore >= 2;
}

module.exports = {
  _scoreEventForEngagement,
  _isQualityContent,
};
