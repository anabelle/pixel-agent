import { character } from './character';
import { createNodePlugin } from "@elizaos/plugin-node";

const nodePlugin = createNodePlugin();

// Create an array of characters for the project
const characters = [character];

// Export for the CLI to use
export default characters;
