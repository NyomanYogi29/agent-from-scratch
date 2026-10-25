import { RedisClient } from "bun";
import { config } from ".";

export class RedisManager {
  private static instance: RedisClient | null = null;

  public static getClient(): RedisClient {
    if (!RedisManager.instance) {
      const client = new RedisClient(config.REDIS_URL, {
        connectionTimeout: 5000,
        autoReconnect: true,
        maxRetries: 10,
        enableOfflineQueue: true,
        enableAutoPipelining: true,
      });

      client.onconnect = () => {
        console.log(`[REDIS] Connecting to redis server.`);
      };

      client.onclose = (error) => {
        if (error) {
          console.error(`[REDIS] Disconnected with error: `, error);
        } else {
          console.log(`[REDIS] Connection closed`);
        }
      };

      RedisManager.instance = client;
    }

    return RedisManager.instance;
  }

  public static async connect(): Promise<void> {
    const client = RedisManager.getClient();
    if (!client.connected) {
      await client.connect();
      const PONG = await client.send("PING", []);
      console.log(`[REDIS] Healthcheck passed with PING -> ${PONG}`);
    }
  }

  public static close(): void {
    if (RedisManager.instance && RedisManager.instance.connected) {
      console.log(`[REIDS] Closing connection`);
      RedisManager.instance.close();
    }
  }
}

// Singleton
export const redis = RedisManager.getClient();

// For redis lifecycle
export const connectToRedis = RedisManager.connect;
export const closeRedis = RedisManager.close;
