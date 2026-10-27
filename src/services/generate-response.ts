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
    episodic.retrieveContext(userId, userPrompt),
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

  const { isWindowFull } = await workingMemory.appendInteraction(
    userId,
    userPrompt,
    text,
  );

  if (isWindowFull) {
    episodic.triggerAutoConsolidation(userId);
  }

  return text;
}
