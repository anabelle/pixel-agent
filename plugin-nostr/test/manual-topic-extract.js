const { extractTopicsFromEvent } = require('../lib/nostr');

async function main() {
  const logger = {
    debug: (...args) => console.log('[DEBUG]', ...args),
    warn: (...args) => console.log('[WARN]', ...args)
  };

  const makeRuntime = (text) => ({
    logger,
    useModel: async (_type, _opts) => ({ text })
  });

  const cases = [
    {
      name: 'China/Gold/Bets',
      event: { id: 'evt1', content: 'Buying gold is a bet on China. China has historically lost these bets.' },
      modelText: 'China\nGold\nBets',
      expect: ['china','gold','bets']
    },
    {
      name: 'Twitter tracking cleaned',
      event: {
        id: 'evt2',
        content: '🤖 Tracking strings detected and removed! https://twitter.com/elonmusk/status/1976068936966996379 https://twitter.com/seamusbruner https://twitter.com/WhiteHouse ?ref_src=twsrc%5Etfw'
      },
      modelText: 'elonmusk\nseamusbruner\nWhiteHouse',
      expect: ['elonmusk','seamusbruner','whitehouse']
    },
    {
      name: 'Nostr relay post',
      event: {
        id: 'evt3',
        content: '⚡🇧🇷 Relay 100% BRASILEIRO no ar! Conecta em: wss://relay.libernet.app #Nostr #Relay #Brasil #Libernet #LiberdadeDigital'
      },
      modelText: 'Nostr\nRelay\nBrasil',
      expect: ['relay','brasil','libernet'] // hashtags will add more; at least ensure not empty
    }
  ];

  for (const c of cases) {
    const topics = await extractTopicsFromEvent(c.event, makeRuntime(c.modelText));
    console.log(`Case: ${c.name}`);
    console.log('Topics:', topics);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
