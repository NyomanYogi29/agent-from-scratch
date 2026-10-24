import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { config } from "../config";

const openrouter = createOpenRouter({
  apiKey: config.OPENROUTER_API_KEY,
});

export const model = openrouter(config.OPENROUTER_MODEL, {
  extraBody: {
    reasoning: {
      exclude: true,
      effort: "none",
    },
  },
  maxTokens: 500,
});
