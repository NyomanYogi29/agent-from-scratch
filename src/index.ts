import { Bot } from "grammy";
import { config } from "./config";
import { model } from "./adapters";
import { generateText } from "ai";
import { SYSTEM } from "./adapters";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

bot.use(async (ctx, next) => {
  if (ctx.from?.id !== config.MASTER_TELEGRAM_ID) {
    return;
  }

  await next();
});

bot.on("message:text", async (ctx) => {
  const userPrompt = ctx.message.text;
  await ctx.replyWithChatAction("typing");

  try {
    const { text } = await generateText({
      model,
      prompt: userPrompt,
      instructions: SYSTEM(new Date()),
    });

    await ctx.reply(text);
  } catch (error) {
    await ctx.reply("Oh noo, error!!");
  }
});

bot.start();
