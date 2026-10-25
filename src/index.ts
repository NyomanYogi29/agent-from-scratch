import { config } from "./config";
import { closeDatabase, initDB } from "./config/db";
import { closeRedis, connectToRedis } from "./config/redis";
import { TelegramGateway } from "./gateways/telegram";
import { generateResponse } from "./services/generate-response";

async function Bootstrap() {
  console.log(`[SYSTEM] Bootstrapping application`);

  // Services
  initDB();
  await connectToRedis();

  // Gateways
  const telegram = new TelegramGateway(
    config.TELEGRAM_BOT_TOKEN,
    config.MASTER_TELEGRAM_ID,
    async ({ userId, text }) => {
      if (text.trim() === "/reset") {
        const { workingMemory } = await import("./services/short-term-memory");
        await workingMemory.clear(userId);
        return `You decided to clear my short term memory, sliding window purged...`;
      }

      return await generateResponse(userId, text);
    },
  );

  // Graceful shutdown mechanism
  let isShuttingDown: boolean = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(
      `[SYSTEM] Receiving signal ${signal}. Initiating graceful shutdown`,
    );
    try {
      await telegram.stop();
      closeRedis();
      closeDatabase();
      console.log(`[SYSTEM] Successfully shutting down telegram gateway`);
      process.exit(0);
    } catch (error) {
      console.error(
        `[SYSTEM] Error occured during shutting down process: `,
        error,
      );
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error(`[SYSTEM] Unhandled rejection: `, reason);
  });

  await telegram.start();
}

Bootstrap().catch((err) => {
  console.error(`[SYSTEM] Fatal error during bootstrap: `, err);
  closeRedis();
  closeDatabase();
  process.exit(1);
});
