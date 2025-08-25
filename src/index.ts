import { character } from './character';

// Ensure the node plugin is in the character configuration
character.plugins = character.plugins || [];
if (!character.plugins.includes('@elizaos/plugin-node')) {
  character.plugins.push('@elizaos/plugin-node');
}

// Create an array of characters for the project
const characters = [character];

// Export for the CLI to use
export default characters;