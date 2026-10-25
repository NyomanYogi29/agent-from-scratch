import { generateText, type ModelMessage } from "ai";
import { workingMemory } from "./short-term-memory";
import { openrouter, SYSTEM } from "../adapters";
import { config } from "../config";
import { episodic } from "./episodic";

export async function generateResponse(
  userId: number,
  userPrompt: string,
): Promise<string> {
  const [history, episodicContext] = await Promise.all([
    workingMemory.getMessages(userId),
    Promise.resolve(episodic.retrieveContext(userId, userPrompt)),
  ]);

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
    system: SYSTEM(episodicContext),
    messages,
    maxOutputTokens: 500,
  });

  await workingMemory.appendInteraction(userId, userPrompt, text);

  return text;
}
