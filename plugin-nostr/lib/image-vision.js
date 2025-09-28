const fetch = require('node-fetch');

function extractImageUrls(content) {
  logger.info('[NOSTR] 🔍 Extracting images from mention content (length ' + content.length + ')');
  logger.info('[NOSTR] Raw content preview: "' + content.replace(/\n/g, '\\n').slice(0, 300) + '..."');
  
  // Aggressive normalization: replace all whitespace sequences with single space
  const normalized = content.replace(/\s+/g, ' ').trim();
  logger.info('[NOSTR] Normalized content: "' + normalized.slice(0, 300) + '..."');
  
  // Simple regex for blossom.primal.net URLs with hash + .jpg
  const urlRegex = /https:\/\/blossom\.primal\.net\/[a-fA-F0-9]{64}\.jpg/gi;
  
  const matches = normalized.match(urlRegex) || [];
  logger.info('[NOSTR] Regex found ' + matches.length + ' potential URLs: ' + matches.join(' | '));
  
  // For now, all matches are considered valid for blossom.primal.net
  const filtered = matches.filter(url => /blossom\.primal\.net/i.test(url));
  
  if (filtered.length > 0) {
    logger.info('[NOSTR] ✅ SUCCESS: Extracted ' + filtered.length + ' image URL(s): ' + filtered.join(', '));
  } else {
    // Debug: log all HTTP URLs found
    const allHttp = normalized.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi) || [];
    logger.warn('[NOSTR] ❌ FAILURE: No images extracted. All HTTP URLs (' + allHttp.length + '): ' + allHttp.join(', '));
  }
  return filtered;
}

async function analyzeImageWithVision(imageUrl, runtime) {
  // Try OpenAI first (primary vision model)
  try {
    const apiKey = runtime.getSetting('OPENAI_API_KEY');
    if (apiKey) {
      logger.info('[NOSTR] 👁️  Calling OpenAI vision for: ' + imageUrl);
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: runtime.getSetting('OPENAI_IMAGE_DESCRIPTION_MODEL') || 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Provide a detailed but concise description of this image for an AI artist to react to. Focus on visual elements, colors, subjects, mood, and artistic style. Keep it under 200 words.'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }],
          max_tokens: parseInt(runtime.getSetting('OPENAI_IMAGE_DESCRIPTION_MAX_TOKENS') || '300'),
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        const description = data.choices[0]?.message?.content?.trim();
        if (description) {
          logger.info('[NOSTR] ✅ OpenAI analyzed image: ' + description.slice(0, 100) + '...');
          return description;
        }
      } else {
        logger.warn('[NOSTR] OpenAI vision response not OK: ' + response.status + ' ' + response.statusText);
      }
    } else {
      logger.warn('[NOSTR] No OPENAI_API_KEY configured - skipping OpenAI vision');
    }
  } catch (error) {
    logger.warn('[NOSTR] OpenAI vision failed: ' + (error.message || error));
  }

  // Fallback to OpenRouter if configured
  try {
    const apiKey = runtime.getSetting('OPENROUTER_API_KEY');
    if (apiKey) {
      logger.info('[NOSTR] 👁️  Calling OpenRouter vision for: ' + imageUrl);
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': runtime.getSetting('OPENROUTER_BASE_URL') || 'https://ln.pixel.xx.kg',
          'X-Title': 'Pixel Nostr Image Analyzer'
        },
        body: JSON.stringify({
          model: runtime.getSetting('OPENROUTER_IMAGE_MODEL') || 'google/gemini-flash-exp:free',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image in detail for an AI artist. Focus on visuals, colors, composition, mood. Concise, under 200 words.'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }],
          max_tokens: 300,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        const description = data.choices[0]?.message?.content?.trim();
        if (description) {
          logger.info('[NOSTR] ✅ OpenRouter analyzed image: ' + description.slice(0, 100) + '...');
          return description;
        }
      } else {
        logger.warn('[NOSTR] OpenRouter vision response not OK: ' + response.status + ' ' + response.statusText);
      }
    } else {
      logger.warn('[NOSTR] No OPENROUTER_API_KEY configured - skipping OpenRouter vision');
    }
  } catch (error) {
    logger.warn('[NOSTR] OpenRouter vision failed: ' + (error.message || error));
  }

  logger.warn('[NOSTR] All vision models failed for image analysis');
  return null;
}

async function generateNaturalReply(originalContent, imageDescription, runtime) {
  const characterSystem = runtime.character?.system || '';
  
  const prompt = 'You are Pixel, reacting to a Nostr mention with an image. \nOriginal message: ' + originalContent + '\n\nYou "saw" the image: ' + imageDescription + '\n\nRespond naturally as Pixel would - with humor, melancholy, existential wit. \nReference the image elements without directly quoting the description. \nMake it feel like you actually saw and reacted to the visual content.\nKeep it conversational and engaging. End with an invitation to collaborate on the canvas if appropriate.\n\nCharacter system reminder: ' + characterSystem.slice(0, 500) + '...';
  
  // Use OpenRouter or OpenAI for generation (prefer the main model)
  const apiKey = runtime.getSetting('OPENROUTER_API_KEY') || runtime.getSetting('OPENAI_API_KEY');
  if (!apiKey) {
    logger.warn('[NOSTR] No API key for reply generation');
    return null;
  }

  const isOpenRouter = !!runtime.getSetting('OPENROUTER_API_KEY');
  const url = isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  
  try {
    logger.info('[NOSTR] 💭 Generating natural reply using ' + (isOpenRouter ? 'OpenRouter' : 'OpenAI'));
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        ...(isOpenRouter && {
          'HTTP-Referer': runtime.getSetting('OPENROUTER_BASE_URL') || 'https://ln.pixel.xx.kg',
          'X-Title': 'Pixel Nostr Reply Generator'
        }),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: isOpenRouter 
          ? (runtime.getSetting('OPENROUTER_MODEL') || 'x-ai/grok-4-fast:free')
          : (runtime.getSetting('OPENAI_MODEL') || 'gpt-4o-mini'),
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.8
      })
    });

    if (response.ok) {
      const data = await response.json();
      const reply = data.choices[0]?.message?.content?.trim();
      if (reply) {
        logger.info('[NOSTR] Generated natural reply: ' + reply.slice(0, 100) + '...');
        return reply;
      }
    } else {
      logger.warn('[NOSTR] Reply generation response not OK: ' + response.status + ' ' + response.statusText);
    }
  } catch (error) {
    logger.error('[NOSTR] Failed to generate natural reply: ' + (error.message || error));
  }

  return null;
}

module.exports = {
  extractImageUrls,
  analyzeImageWithVision,
  generateNaturalReply
};