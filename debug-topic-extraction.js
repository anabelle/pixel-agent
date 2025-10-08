#!/usr/bin/env node

// Debug script for topic extraction
const prompt = `Analyze this post and identify 1-3 specific topics or themes. Be precise and insightful - avoid generic terms like "general" or "discussion".

Post: "Chicago mayor signs executive order preventing ICE from using city property https://youtu.be/67g_BySnkaY"

Examples of good topics:
- Instead of "tech": "AI agents", "nostr protocol", "bitcoin mining"
- Instead of "art": "pixel art", "collaborative canvas", "generative design"
- Instead of "social": "community building", "decentralization", "privacy advocacy"

Respond with ONLY the topics, comma-separated (e.g., "bitcoin lightning, micropayments, value4value"):`;

console.log('Prompt:', prompt);

const mockResponse = {
  text: "immigration policy, government authority, sanctuary cities",
  content: "backup",
  choices: [{ message: { content: "backup" } }]
};

console.log('Mock response:', JSON.stringify(mockResponse, null, 2));

if (mockResponse?.text) {
  const llmTopics = mockResponse.text.trim()
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && t.length < 500)
    .filter(t => t !== 'general' && t !== 'various' && t !== 'discussion');
  console.log('Parsed topics:', llmTopics);
} else {
  console.log('No text in response');
}