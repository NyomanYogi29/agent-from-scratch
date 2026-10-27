import type { ModelMessage } from "ai";
import { redis } from "../config/redis";

export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamps: number;
}

export class ShortTermMemory {
  private readonly maxMessages: number;
  private readonly ttlSeconds: number;

  /**
   * @param maxMessages maximum sum of messages that can be stored. Preferred even number over odd for pairing message => 20 : 2 = 10 dialogs
   * @param ttlSeonds Expiration time for memory if there are not incoming messages. Default: 24 hours
   */
  constructor(maxMessages = 20, ttlSeonds = 86400) {
    this.maxMessages = maxMessages;
    this.ttlSeconds = ttlSeonds;
  }

  private getKey(userId: number | string): string {
    return `memory:stm:${userId}`;
  }

  public async getStoredMessages(
    userId: number | string,
  ): Promise<StoredChatMessage[]> {
    const key = this.getKey(userId);
    const rawList = (await redis.send("LRANGE", [key, "0", "-1"])) as
      | string[]
      | null;

    if (!rawList || rawList.length === 0) {
      return [];
    }

    const stored: StoredChatMessage[] = [];

    for (const item of rawList) {
      try {
        const parsed = JSON.parse(item) as StoredChatMessage;
        stored.push(parsed);
      } catch (err) {
        console.warn(
          `[ShortTermMemory] Failed to parse message from Redis: `,
          err,
        );
      }
    }

    return stored;
  }

  public async getMessages(userId: number | string): Promise<ModelMessage[]> {
    const stored = await this.getStoredMessages(userId);
    return stored.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  public async appendInteraction(
    userId: number | string,
    userText: string,
    assistantText: string,
  ): Promise<{ totalMessages: number; isWindowFull: boolean }> {
    const key = this.getKey(userId);
    const now = Date.now();

    const userMessage: StoredChatMessage = {
      role: "user",
      content: userText,
      timestamps: now,
    };

    const assistantMessage: StoredChatMessage = {
      role: "assistant",
      content: assistantText,
      timestamps: now,
    };

    const [length] = await Promise.all([
      redis.send("RPUSH", [
        key,
        JSON.stringify(userMessage),
        JSON.stringify(assistantMessage),
      ]) as Promise<number>,
      redis.expire(key, this.ttlSeconds),
    ]);

    const totalMessages = Number(length);
    return {
      totalMessages,
      isWindowFull: totalMessages >= this.maxMessages,
    };
  }

  public async removeOldest(
    userId: number | string,
    count: number,
  ): Promise<void> {
    if (count <= 0) return;
    const key = this.getKey(userId);
    await redis.send("LTRIM", [key, String(count), "-1"]);
  }

  public async clear(userId: number | string): Promise<void> {
    const key = this.getKey(userId);
    await redis.del(key);
  }
}

export const workingMemory = new ShortTermMemory();
