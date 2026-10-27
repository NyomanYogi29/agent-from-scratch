import { embed, generateText, Output } from "ai";
import { z } from "zod";
import { openrouter } from "../adapters";
import { config, db, master_name } from "../config";
import { workingMemory, type StoredChatMessage } from "./short-term-memory";

export interface EpisodicMetadata {
  topic: string;
  timestamps: number;
  master_name: string;
}

interface EpisodicSearchRow {
  id: number;
  summary: string;
  outcome: string;
  metadata: string;
  distance: number;
}

const ConsolidationSummarySchema = z.object({
  topic: z
    .string()
    .describe(
      "The main topic of the conversation, stated briefly and concisely",
    ),
  summary: z
    .string()
    .describe("Factual summarization from the conversation's content"),
  outcome: z
    .string()
    .describe("Conclusion, last decision or follow-up the conversation"),
});

const AUTO_CONSOLIDATE_BATCH_SIZE = 16;
const MANUAL_KEEP_RECENT_COUNT = 4;
const TOP_K_MEMORIES = 3;
const MAX_COSINE_DISTANCE = 0.6;
const EMPTY_MEMORY_MESSAGE = "No relevant episodic memory available yet.";

export class EpisodicMemory {
  private isConsolidating = new Set<string>();

  private toVectorBlob(embedding: number[]): Uint8Array {
    const float32 = new Float32Array(embedding);
    return new Uint8Array(float32.buffer);
  }

  private async createEmbedding(text: string): Promise<Uint8Array> {
    const { embedding } = await embed({
      model: openrouter.textEmbeddingModel(config.OPENROUTER_EMBEDDING_MODEL),
      value: text,
    });

    return this.toVectorBlob(embedding);
  }

  private async summarizeMessages(messages: StoredChatMessage[]): Promise<{
    topic: string;
    summary: string;
    outcome: string;
  }> {
    const master = master_name;
    const transcript = messages
      .map((m) => {
        const speaker = m.role === "user" ? master : "Lya";
        return `${speaker}: ${m.content}`;
      })
      .join("\n");

    const { output } = await generateText({
      model: openrouter(config.OPENROUTER_MODEL, {
        extraBody: { reasoning: { exclude: true, effort: "none" } },
      }),
      output: Output.object({ schema: ConsolidationSummarySchema }),
      system:
        "You are an episodic memory consolidation engine. Summarize the following conversation log objectively, factually, and concisely in Indonesian, without fabricating any information beyond what is provided in the text.",
      prompt: `Summarize the following conversation between ${master} and Lya into a topic, summary, and outcome.:\n\n---\n${transcript}`,
      temperature: 0.1,
    });

    return output;
  }

  private saveMemoryRecord(
    userId: string,
    summary: string,
    outcome: string,
    metadata: EpisodicMetadata,
    vectorBlob: Uint8Array,
  ): void {
    const insertMemory = db.prepare(`
      INSERT INTO episodic_memories (user_id, summary, outcome, metadata)
      VALUES (?, ?, ?, ?)
    `);

    const insertVector = db.prepare(`
      INSERT INTO episodic_vec (memory_id, user_id, embedding)
      VALUES (?, ?, ?)
    `);

    const tx = db.transaction(() => {
      const result = insertMemory.run(
        userId,
        summary,
        outcome,
        JSON.stringify(metadata),
      );
      insertVector.run(BigInt(result.lastInsertRowid), userId, vectorBlob);
    });

    tx();
  }

  private async consolidateBatch(
    uid: string,
    messagesToConsolidate: StoredChatMessage[],
  ): Promise<{ topic: string; summary: string; outcome: string }> {
    const { topic, summary, outcome } = await this.summarizeMessages(
      messagesToConsolidate,
    );

    const textToEmbed = `[Topic: ${topic}] Summary: ${summary} Outcome: ${outcome}`;
    const vectorBlob = await this.createEmbedding(textToEmbed);

    const lastMessageTimestamp =
      messagesToConsolidate[messagesToConsolidate.length - 1]?.timestamps ??
      Date.now();

    const metadata: EpisodicMetadata = {
      topic,
      timestamps: lastMessageTimestamp,
      master_name: master_name || "",
    };

    this.saveMemoryRecord(uid, summary, outcome, metadata, vectorBlob);

    return { topic, summary, outcome };
  }

  public triggerAutoConsolidation(userId: number | string): void {
    const uid = String(userId);
    if (this.isConsolidating.has(uid)) return;

    this.isConsolidating.add(uid);

    this.runAutoConsolidation(uid)
      .catch((err) =>
        console.error("[EPISODIC] Auto-consolidation failed:", err),
      )
      .finally(() => {
        this.isConsolidating.delete(uid);
      });
  }

  private async runAutoConsolidation(uid: string): Promise<void> {
    const storedMessages = await workingMemory.getStoredMessages(uid);
    if (storedMessages.length < AUTO_CONSOLIDATE_BATCH_SIZE) {
      return;
    }

    const batch = storedMessages.slice(0, AUTO_CONSOLIDATE_BATCH_SIZE);
    const { topic } = await this.consolidateBatch(uid, batch);
    await workingMemory.removeOldest(uid, batch.length);

    console.log(
      `[EPISODIC] Auto-consolidated ${batch.length} oldest messages (Topic: ${topic})`,
    );
  }

  public async consolidateManual(userId: number | string): Promise<{
    status: "consolidated" | "empty" | "busy";
    consolidatedCount: number;
    remainingCount: number;
    topic?: string;
  }> {
    const uid = String(userId);
    if (this.isConsolidating.has(uid)) {
      return {
        status: "busy",
        consolidatedCount: 0,
        remainingCount: 0,
      };
    }

    this.isConsolidating.add(uid);
    try {
      const storedMessages = await workingMemory.getStoredMessages(uid);
      if (storedMessages.length === 0) {
        return {
          status: "empty",
          consolidatedCount: 0,
          remainingCount: 0,
        };
      }

      const shouldConsolidateAll =
        storedMessages.length <= MANUAL_KEEP_RECENT_COUNT;
      const batch = shouldConsolidateAll
        ? storedMessages
        : storedMessages.slice(
            0,
            storedMessages.length - MANUAL_KEEP_RECENT_COUNT,
          );

      const { topic } = await this.consolidateBatch(uid, batch);

      if (shouldConsolidateAll) {
        await workingMemory.clear(uid);
      } else {
        await workingMemory.removeOldest(uid, batch.length);
      }

      const remainingCount = shouldConsolidateAll
        ? 0
        : storedMessages.length - batch.length;

      console.log(
        `[EPISODIC] Manual consolidation completed: ${batch.length} messages consolidated, ${remainingCount} remaining (Topic: ${topic})`,
      );

      return {
        status: "consolidated",
        consolidatedCount: batch.length,
        remainingCount,
        topic,
      };
    } finally {
      this.isConsolidating.delete(uid);
    }
  }

  public async retrieveContext(
    userId: number | string,
    queryText: string,
  ): Promise<string> {
    const uid = String(userId);

    try {
      const queryVectorBlob = await this.createEmbedding(queryText);

      const matchedRows = db
        .query<EpisodicSearchRow, [string, Uint8Array, number]>(
          `SELECT m.id, m.summary, m.outcome, m.metadata, v.distance
           FROM episodic_vec v
           JOIN episodic_memories m ON m.id = v.memory_id
           WHERE v.user_id = ?
             AND v.embedding MATCH ?
             AND k = ?`,
        )
        .all(uid, queryVectorBlob, TOP_K_MEMORIES);

      const relevantRows = matchedRows.filter(
        (row) => row.distance <= MAX_COSINE_DISTANCE,
      );

      if (relevantRows.length === 0) {
        return EMPTY_MEMORY_MESSAGE;
      }

      const formattedMemories = relevantRows.map((row) => {
        let topic = "Common";
        let formattedDate = "Unknown Date";

        try {
          const meta = JSON.parse(row.metadata) as EpisodicMetadata;
          if (meta.topic) topic = meta.topic;
          if (meta.timestamps) {
            formattedDate = new Date(meta.timestamps).toLocaleDateString(
              "id-ID",
              {
                day: "2-digit",
                month: "short",
                year: "numeric",
              },
            );
          }
        } catch {
          // ignore malformed metadata JSON
        }

        return `[${formattedDate} | Topic: ${topic}] Summary: ${row.summary} | Outcome: ${row.outcome}`;
      });

      return formattedMemories.join("\n\n");
    } catch (error) {
      console.warn(`[EPISODIC] Vector search error:`, error);
      return EMPTY_MEMORY_MESSAGE;
    }
  }
}

export const episodic = new EpisodicMemory();
