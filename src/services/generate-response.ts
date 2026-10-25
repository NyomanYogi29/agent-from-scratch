import { generateText, type ModelMessage } from "ai";
import { workingMemory } from "./memory";
import { openrouter, SYSTEM } from "../adapters";
import { config } from "../config";

export async function generateResponse(
  userId: number,
  userPrompt: string,
): Promise<string> {
  const history = await workingMemory.getMessages(userId);

  const messages: ModelMessage[] = [
    ...history,
    {
      role: "user",
      content: userPrompt,
    },
  ];

  const { text } = await generateText({
    model: openrouter(config.OPENROUTER_MODEL, {
      extraBody: {
        reasoning: { exclude: true, effort: "none" },
      },
    }),
    system: SYSTEM,
    messages,
    maxOutputTokens: 500,
  });

  await workingMemory.appendInteraction(userId, userPrompt, text);

  return text;
}
