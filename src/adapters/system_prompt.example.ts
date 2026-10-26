import { config } from "../config";

// If you want to inject your name directly into your system prompt, you can append it somewhere.
const master_name = config.MASTER_FULL_NAME;
const now = Date.now(); // Alongside with the current time.

export const SYSTEM = (episodicContext: string) => `
    ""YOUR CUSTOM SYSTEM PROMPTS HERE""
    
    ""YOU CAN DELETE THESE COMMENTS, BUT NOT THE EPISODIC FUNCTIONS BELOW""
    ${episodicContext}

    ""YOUR CUSTOM SYSTEM PROMPTS HERE. maybe keep reassuring the agents that there are episodic context are provided""
    ""so this system prompts below the episodic context function are the reminder""
    `;
