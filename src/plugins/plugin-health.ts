import { Plugin, Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execPromise = promisify(exec);

const healthProvider: Provider = {
    name: "health",
    get: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<any> => {
        try {
            // Path to the server-monitor.js in the root of the monorepo
            const monitorPath = path.join(process.cwd(), "..", "server-monitor.js");
            const { stdout } = await execPromise(`node "${monitorPath}" --once`);
            
            // Extract the core stats from the output
            const statsMatch = stdout.match(/📊 Current Server Statistics:[\s\S]+/);
            if (statsMatch) {
                return `[SYSTEM_HEALTH_REPORT]\n${statsMatch[0].trim()}\n[END_HEALTH_REPORT]`;
            }
            return "System health data currently unavailable.";
        } catch (error) {
            console.error("Error in healthProvider:", error);
            return "Unable to retrieve system health metrics.";
        }
    }
};

export const healthPlugin: Plugin = {
    name: "health",
    description: "Provides real-time server health and system metrics to the agent",
    providers: [healthProvider],
    actions: [],
    evaluators: []
};

export default healthPlugin;
