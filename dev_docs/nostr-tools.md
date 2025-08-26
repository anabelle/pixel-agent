========================
CODE SNIPPETS
========================
TITLE: Install nostr-tools
DESCRIPTION: Instructions for installing the nostr-tools package using npm or jsr.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_0

LANGUAGE: bash
CODE:
```
# npm
npm install --save nostr-tools

# jsr
npx jsr add @nostr/tools
```

----------------------------------------

TITLE: Browser Usage without Bundler
DESCRIPTION: Provides an example of how to use nostr-tools directly from a browser by including the bundled JavaScript file via a CDN. It shows how to access the global NostrTools object and its functions.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_15

LANGUAGE: html
CODE:
```
<script src="https://unpkg.com/nostr-tools/lib/nostr.bundle.js"></script>
<script>
  window.NostrTools.generateSecretKey('...') // and so on
</script>
```

----------------------------------------

TITLE: Interact with Relays using SimplePool
DESCRIPTION: Demonstrates querying for single and multiple events, subscribing to events, publishing events, and managing relay connections using SimplePool.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_4

LANGUAGE: js
CODE:
```
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'

const pool = new SimplePool()

const relays = ['wss://relay.example.com', 'wss://relay.example2.com']

// let's query for one event that exists
const event = pool.get(
  relays,
  {
    ids: ['d7dd5eb3ab747e16f8d0212d53032ea2a7cadef53837e5a6c66d42849fcb9027'],
  },
)
if (event) {
  console.log('it exists indeed on this relay:', event)
}

// let's query for more than one event that exists
const events = pool.querySync(
  relays,
  {
    kinds: [1],
    limit: 10
  },
)
if (events) {
  console.log('it exists indeed on this relay:', events)
}

// let's publish a new event while simultaneously monitoring the relay for it
let sk = generateSecretKey()
let pk = getPublicKey(sk)

pool.subscribe(
  ['wss://a.com', 'wss://b.com', 'wss://c.com'],
  {
    kinds: [1],
    authors: [pk],
  },
  {
    onevent(event) {
      console.log('got event:', event)
    }
  }
)

let eventTemplate = {
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'hello world',
}

// this assigns the pubkey, calculates the event id and signs the event in a single step
const signedEvent = finalizeEvent(eventTemplate, sk)
await Promise.any(pool.publish(['wss://a.com', 'wss://b.com'], signedEvent))

relay.close()
```

----------------------------------------

TITLE: Connecting to a Bunker using NIP-46
DESCRIPTION: Demonstrates how to connect to a Nostr bunker service using NIP-46. It covers generating a local secret key, parsing a bunker URI, creating a BunkerSigner instance, connecting, and then signing an event.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_8

LANGUAGE: js
CODE:
```
import { generateSecretKey, getPublicKey } from '@nostr/tools/pure'
import { BunkerSigner, parseBunkerInput } from '@nostr/tools/nip46'
import { SimplePool } from '@nostr/tools/pool'

// the client needs a local secret key (which is generally persisted) for communicating with the bunker
const localSecretKey = generateSecretKey()

// parse a bunker URI
const bunkerPointer = await parseBunkerInput('bunker://abcd...?relay=wss://relay.example.com')
if (!bunkerPointer) {
  throw new Error('Invalid bunker input')
}

// create the bunker instance
const pool = new SimplePool()
const bunker = new BunkerSigner(localSecretKey, bunkerPointer, { pool })
await bunker.connect()

// and use it
const pubkey = await bunker.getPublicKey()
const event = await bunker.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Hello from bunker!'
})

// cleanup
await signer.close()
pool.close([])
```

----------------------------------------

TITLE: Initialize nostr-wasm with nostr-tools
DESCRIPTION: Demonstrates how to import and initialize nostr-wasm to be used with nostr-tools functions like finalizeEvent and verifyEvent. It highlights the need to resolve the initialization promise before using these functions.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_13

LANGUAGE: javascript
CODE:
```
import { setNostrWasm, generateSecretKey, finalizeEvent, verifyEvent } from 'nostr-tools/wasm'
import { initNostrWasm } from 'nostr-wasm'

// make sure this promise resolves before your app starts calling finalizeEvent or verifyEvent
initNostrWasm().then(setNostrWasm)

// or use 'nostr-wasm/gzipped' or even 'nostr-wasm/headless',
// see https://www.npmjs.com/package/nostr-wasm for options
```

----------------------------------------

TITLE: Querying Profile Data from NIP-05 Address
DESCRIPTION: Shows how to query profile information using a NIP-05 address. It includes the basic usage and instructions for older Node.js versions requiring `node-fetch`.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_10

LANGUAGE: js
CODE:
```
import { queryProfile } from 'nostr-tools/nip05'

let profile = await queryProfile('jb55.com')
console.log(profile.pubkey)
// prints: 32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245
console.log(profile.relays)
// prints: [wss://relay.damus.io]
```

LANGUAGE: js
CODE:
```
import { useFetchImplementation } from 'nostr-tools/nip05'
useFetchImplementation(require('node-fetch'))
```

----------------------------------------

TITLE: Nostr Tools Development Commands
DESCRIPTION: Lists available commands for developing nostr-tools using the 'just' task runner. Users can run 'just -l' to see the full list of commands.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_16

LANGUAGE: plaintext
CODE:
```
just -l
```

----------------------------------------

TITLE: Using AbstractRelay and AbstractSimplePool with nostr-wasm
DESCRIPTION: Shows how to integrate nostr-wasm with AbstractRelay and AbstractSimplePool by importing the necessary modules and passing the verifyEvent function during instantiation. This is required when using these abstract classes instead of the defaults.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_14

LANGUAGE: javascript
CODE:
```
import { setNostrWasm, verifyEvent } from 'nostr-tools/wasm'
import { AbstractRelay } from 'nostr-tools/abstract-relay'
import { AbstractSimplePool } from 'nostr-tools/abstract-pool'
import { initNostrWasm } from 'nostr-wasm'

initNostrWasm().then(setNostrWasm)

const relay = AbstractRelay.connect('wss://relayable.org', { verifyEvent })
const pool = new AbstractSimplePool({ verifyEvent })
```

----------------------------------------

TITLE: Create, Sign, and Verify Nostr Events
DESCRIPTION: Finalizes a Nostr event with necessary fields and signs it with a private key, then verifies the event's signature.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_3

LANGUAGE: js
CODE:
```
import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'

let event = finalizeEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'hello',
}, sk)

let isGood = verifyEvent(event)
```

----------------------------------------

TITLE: Configure WebSocket Implementation for Node.js
DESCRIPTION: Sets the WebSocket implementation for nostr-tools when running in a Node.js environment, typically using the 'ws' package.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_5

LANGUAGE: js
CODE:
```
import { useWebSocketImplementation } from 'nostr-tools/pool'
// or import { useWebSocketImplementation } from 'nostr-tools/relay' if you're using the Relay directly

import WebSocket from 'ws'
useWebSocketImplementation(WebSocket)
```

----------------------------------------

TITLE: Generate Private and Public Keys
DESCRIPTION: Generates a private key (Uint8Array) and derives the corresponding public key (hex string) using nostr-tools.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_1

LANGUAGE: js
CODE:
```
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'

let sk = generateSecretKey() // `sk` is a Uint8Array
let pk = getPublicKey(sk) // `pk` is a hex string
```

----------------------------------------

TITLE: Enable Relay Pings with SimplePool
DESCRIPTION: Configures SimplePool to enable regular pings to connected relays, improving reliability by detecting unresponsive connections.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_6

LANGUAGE: js
CODE:
```
import { SimplePool } from 'nostr-tools/pool'

const pool = new SimplePool({ enablePing: true })
```

----------------------------------------

TITLE: Encoding and Decoding NIP-19 Codes
DESCRIPTION: Illustrates the usage of NIP-19 for encoding and decoding various Nostr identifiers like `nsec`, `npub`, and `nprofile`. It demonstrates converting secret keys to `nsec`, public keys to `npub`, and creating/parsing `nprofile` with public keys and relays.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_12

LANGUAGE: js
CODE:
```
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'

let sk = generateSecretKey()
let nsec = nip19.nsecEncode(sk)
let { type, data } = nip19.decode(nsec)
assert(type === 'nsec')
assert(data === sk)

let pk = getPublicKey(generateSecretKey())
let npub = nip19.npubEncode(pk)
let { type, data } = nip19.decode(npub)
assert(type === 'npub')
assert(data === pk)

let pk = getPublicKey(generateSecretKey())
let relays = ['wss://relay.nostr.example.mydomain.example.com', 'wss://nostr.banana.com']
let nprofile = nip19.nprofileEncode({ pubkey: pk, relays })
let { type, data } = nip19.decode(nprofile)
assert(type === 'nprofile')
assert(data.pubkey === pk)
assert(data.relays.length === 2)
```

----------------------------------------

TITLE: Parsing Threads from Notes using NIP-10
DESCRIPTION: Explains how to parse Nostr events to identify thread structures based on NIP-10. It shows how to extract the root event, immediate parent, mentions, quotes, and referenced profiles from an event's tags.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_9

LANGUAGE: js
CODE:
```
import * as nip10 from '@nostr/tools/nip10'

// event is a nostr event with tags
const refs = nip10.parse(event)

// get the root event of the thread
if (refs.root) {
  console.log('root event:', refs.root.id)
  console.log('root event relay hints:', refs.root.relays)
  console.log('root event author:', refs.root.author)
}

// get the immediate parent being replied to
if (refs.reply) {
  console.log('reply to:', refs.reply.id)
  console.log('reply relay hints:', refs.reply.relays)
  console.log('reply author:', refs.reply.author)
}

// get any mentioned events
for (let mention of refs.mentions) {
  console.log('mentioned event:', mention.id)
  console.log('mention relay hints:', mention.relays)
  console.log('mention author:', mention.author)
}

// get any quoted events
for (let quote of refs.quotes) {
  console.log('quoted event:', quote.id)
  console.log('quote relay hints:', quote.relays)
}

// get any referenced profiles
for (let profile of refs.profiles) {
  console.log('referenced profile:', profile.pubkey)
  console.log('profile relay hints:', profile.relays)
}
```

----------------------------------------

TITLE: Parse Nostr References (NIP-27)
DESCRIPTION: Parses a Nostr event's content to extract text, URLs, media, and Nostr-specific references (nevent, naddr, npub, nprofile) using the nip27 module.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_7

LANGUAGE: js
CODE:
```
import * as nip27 from '@nostr/tools/nip27'

for (let block of nip27.parse(evt.content)) {
  switch (block.type) {
    case 'text':
      console.log(block.text)
      break
    case 'reference': {
      if ('id' in block.pointer) {
        console.log("it's a nevent1 uri", block.pointer)
      } else if ('identifier' in block.pointer) {
        console.log("it's a naddr1 uri", block.pointer)
      } else {
        console.log("it's an npub1 or nprofile1 uri", block.pointer)
      }
      break
    }
    case 'url': {
      console.log("it's a normal url:", block.url)
      break
    }
    case 'image':
    case 'video':
    case 'audio':
      console.log("it's a media url:", block.url)
    case 'relay':
      console.log("it's a websocket url, probably a relay address:", block.url)
    default:
      break
  }
}
```

----------------------------------------

TITLE: Including NIP-07 Types
DESCRIPTION: Provides TypeScript type definitions for the Nostr browser extension API (NIP-07) to aid in development.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_11

LANGUAGE: typescript
CODE:
```
import type { WindowNostr } from 'nostr-tools/nip07'

declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}
```

----------------------------------------

TITLE: Convert Secret Key to Hex
DESCRIPTION: Converts a secret key from Uint8Array to a hex string and back using @noble/hashes utilities.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_2

LANGUAGE: js
CODE:
```
import { bytesToHex, hexToBytes } from '@noble/hashes/utils' // already an installed dependency

let skHex = bytesToHex(sk)
let backToBytes = hexToBytes(skHex)
```

----------------------------------------

TITLE: Nostr Tools Contribution Patch Address
DESCRIPTION: Provides the Nostr address (naddr) for submitting patches to the nostr-tools repository, as per NIP-34.

SOURCE: https://github.com/nbd-wtf/nostr-tools/blob/master/README.md#_snippet_17

LANGUAGE: plaintext
CODE:
```
naddr1qq9kummnw3ez6ar0dak8xqg5waehxw309aex2mrp0yhxummnw3ezucn8qyt8wumn8ghj7un9d3shjtnwdaehgu3wvfskueqpzemhxue69uhhyetvv9ujuurjd9kkzmpwdejhgq3q80cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsxpqqqpmejdv00jq
```