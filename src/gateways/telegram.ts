import { Bot, GrammyError, HttpError } from "grammy";

export interface IncomingMessageContext {
  userId: number;
  text: string;
}

export type MessageHandler = (ctx: IncomingMessageContext) => Promise<string>;

export class TelegramGateway {
  private bot: Bot;
  private masterId: number;

  constructor(token: string, masterId: number, onMessage: MessageHandler) {
    this.bot = new Bot(token);
    this.masterId = masterId;

    this.setupMiddleware();
    this.setupHandlers(onMessage);
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    this.bot.use(async (ctx, next) => {
      if (ctx.from?.id !== this.masterId) {
        console.warn(
          `[TelegramGateway] Unauthorized attempt coming from user with id: ${ctx.from?.id}`,
        );
        return;
      }

      await next();
    });
  }

  private setupHandlers(onMessage: MessageHandler) {
    this.bot.on("message:text", async (ctx) => {
      await ctx.replyWithChatAction("typing");

      const response = await onMessage({
        userId: ctx.from.id,
        text: ctx.message.text,
      });

      await ctx.reply(response);
    });
  }

  private setupErrorHandling() {
    this.bot.catch((err) => {
      const ctx = err.ctx;
      const e = err.error;

      if (e instanceof GrammyError) {
        console.error("Error in telegram request ", e.description);
      } else if (e instanceof HttpError) {
        console.error("Could not connect to telegram network ", e);
      } else {
        console.error("Unknown error occured in handler ", e);
      }

      ctx.reply("Errors are occuring on the server. Go fix it :)");
    });
  }

  public async start() {
    try {
      await this.bot.init();
      console.log(
        `[TelegramGateway] Connecting to ${this.bot.botInfo.username}`,
      );
    } finally {
      this.bot.start({
        drop_pending_updates: true,
        onStart: () => {
          console.log(`[TelegramGateway] Bot is ready!`);
        },
      });
    }
  }

  public async stop() {
    await this.bot.stop();
    console.log(`[TelegramGateway] Stopping operation!`);
  }
}
