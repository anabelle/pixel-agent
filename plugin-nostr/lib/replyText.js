"use strict";

const baseChoices = ['noted.', 'seen.', 'alive.', 'breathing pixels.', 'gm.', 'ping received.'];

function pickReplyTextFor(evt) {
  const content = (evt?.content || '').trim();
  if (!content) return baseChoices[Math.floor(Math.random() * baseChoices.length)];
  if (content.length < 10) return 'yo.';
  if (content.includes('?')) return 'hmm.';
  return baseChoices[Math.floor(Math.random() * baseChoices.length)];
}

module.exports = { pickReplyTextFor };
