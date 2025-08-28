const { generateThanksText } = require('./lib/zaps.js');

console.log('\n=== BEFORE (Static Implementation) ===');
console.log('21 sats:', generateThanksText(21000));
console.log('100 sats:', generateThanksText(100000));
console.log('1000 sats:', generateThanksText(1000000));

console.log('\n=== AFTER (LLM-Generated with Sender Awareness) ===');
console.log('The LLM will now generate personalized messages like:');
console.log('• "Thank you so much for the zap! ⚡️ Your support means everything!"');
console.log('• "⚡️ Amazing, thank you for the sats! This community is incredible!"');
console.log('• "Wow, that\'s incredibly generous! ⚡️ Thank you, friend!"');
console.log('\nPLUS technical mention gets automatically added: nostr:npub1...');

console.log('\n✅ Benefits:');
console.log('• Personalized based on character personality');
console.log('• Context-aware of zap amount');
console.log('• Natural acknowledgment of sender');
console.log('• Still includes proper Nostr protocol mentions');
console.log('• Fallback to static messages if LLM fails');
