
import { SimplePool, finalizeEvent, nip19 } from 'nostr-tools';

// Bun has native WebSocket support, so we don't need to polyfill it
// for nostr-tools in this environment.

const hexCharCodes = (char: number) => {
    if (char >= 48 && char <= 57) return char - 48;
    if (char >= 97 && char <= 102) return char - 97 + 10;
    if (char >= 65 && char <= 70) return char - 65 + 10;
    return -1;
};

const hexToBytes = (hex: string): Uint8Array | null => {
    if (typeof hex !== 'string' || hex.length % 2 !== 0) return null;
    const len = hex.length / 2;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const h = hexCharCodes(hex.charCodeAt(i * 2));
        const l = hexCharCodes(hex.charCodeAt(i * 2 + 1));
        if (h === -1 || l === -1) return null;
        bytes[i] = (h << 4) | l;
    }
    return bytes;
};

const parseSk = (input: string | undefined) => {
    if (!input) return null;
    try {
        if (input.startsWith('nsec1')) {
            const decoded = nip19.decode(input);
            if (decoded.type === 'nsec') return decoded.data;
        }
    } catch { }
    return hexToBytes(input);
};

const main = async () => {
    const skInput = process.env.NOSTR_PRIVATE_KEY;
    const relaysInput = process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://relay.primal.net';
    const content = process.argv[2];

    if (!skInput) {
        console.error('Error: NOSTR_PRIVATE_KEY is not set');
        process.exit(1);
    }
    if (!content) {
        console.error('Usage: bun scripts/manual-post.ts "message"');
        process.exit(1);
    }

    const sk = parseSk(skInput);
    if (!sk) {
        console.error('Error: Invalid NOSTR_PRIVATE_KEY');
        process.exit(1);
    }

    const relays = relaysInput.split(',').map(r => r.trim()).filter(r => r);
    const pool = new SimplePool();

    const event = finalizeEvent({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: content,
    }, sk);

    console.log(`Publishing event ${event.id} to ${relays.length} relays...`);

    try {
        const pubs = pool.publish(relays, event);
        await Promise.any(pubs);
        console.log('Success: Published to at least one relay');

        // Give a short time for others to complete before exiting
        await new Promise(r => setTimeout(r, 1000));
        process.exit(0);
    } catch (error) {
        console.error('Error: Failed to publish to any relay', error);
        process.exit(1);
    }
};

main();
