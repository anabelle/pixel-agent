import { character } from './character';

// Stability: Global error handlers to prevent PM2 restart loops from unhandled rejections
// This is critical for network-heavy plugins like Nostr that can have unstable connections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Do not exit, just log it. PM2 will stay up.
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // For uncaught exceptions, we log and decide if we must exit
    // If it's a critical boot error, we exit. If it's a runtime glitch, we try to stay alive.
    if (err && err.message && (err.message.includes('EADDRINUSE') || err.message.includes('ELIZA_SERVER_AUTH_TOKEN'))) {
        process.exit(1);
    }
});

// Create an array of characters for the project
const characters = [character];


// Export for the CLI to use
export default characters;
