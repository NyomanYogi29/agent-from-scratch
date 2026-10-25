import { generateText } from "ai";
import { db } from "../config/db";
import { openrouter } from "../adapters";
import { config } from "../config";

interface HMTNodeRow {
  level: number;
  period_key: string;
  summary: string;
}

export class HierarchicalEpisodicMemory {
  private isConsolidating = new Set<string>();

  private getTemporalKeys(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    const startOfYear = new Date(year, 0, 1);
    const pastDays =
      Math.floor(date.getTime() - startOfYear.getTime()) / 864000;
    const weekNum = String(
      Math.ceil((pastDays + startOfYear.getDay() + 1) / 7),
    );

    return {
      dateKey: `${year}-${month}-${day}`,
      weekKey: `${year}-W${weekNum}`,
      monthKey: `${year}-${month}`,
    };
  }

  public logInteraction(
    userId: number | string,
    userText: string,
    assistantText: string,
  ): void {
    const uid = String(userId);
    const now = Date.now();

    const { dateKey, weekKey, monthKey } = this.getTemporalKeys(new Date(now));

    const insertStatement = db.prepare(`
        INSERT INTO raw_logs (user_id, role, content, date_key, week_key, month_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      insertStatement.run(
        uid,
        "user",
        userText,
        dateKey,
        weekKey,
        monthKey,
        now,
      );
      insertStatement.run(
        uid,
        "assistant",
        assistantText,
        dateKey,
        weekKey,
        monthKey,
        now + 1,
      );
    });

    transaction();
  }

  public retrieveContext(userId: number | string, queryText: string): string {
    const uid = String(userId);
    const results: string[] = [];

    const latestNode = db
      .query<HMTNodeRow, [string]>(
        `SELECT level, period_key, summary FROM hmt_nodes
         WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(uid);

    if (latestNode) {
      results.push(
        `[Latest Summary (${latestNode.period_key})]: ${latestNode.summary}`,
      );
    }

    const token = queryText
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3);

    if (token.length > 0) {
      const ftsQuery = token.map((t) => `"${t}"`).join(" OR ");

      try {
        const matchedNode = db
          .query<HMTNodeRow, [string, string]>(
            `SELECT level, period_key, summary
            FROM hmt_nodes_fts
            WHERE user_id = ? AND hmt_nodes_fts MATCH ?
            ORDER BY bm25(hmt_nodes_fts) LIMIT 3`,
          )
          .all(uid, ftsQuery);

        for (const node of matchedNode) {
          if (latestNode && node.period_key === latestNode.period_key) continue;

          const levelLable =
            node.level === 1
              ? "Daily"
              : node.level === 2
                ? "Weekly"
                : "Monthly";
          results.push(
            `[${levelLable} memory (${node.period_key})]: ${node.summary}`,
          );
        }
      } catch (error) {
        console.warn(`[EPISODIC] FTS5 Query error: `, error);
      }
    }

    return results.length > 0
      ? results.join("\n\n")
      : "No past memories available";
  }

  public triggerBackgroundConsolidation(userId: number | string): void {
    const uid = String(userId);
    if (this.isConsolidating.has(uid)) return;

    this.isConsolidating.add(uid);
    this.runConsolidation(uid)
      .catch((err) =>
        console.error("[EPISODIC] Background consolidation failed:", err),
      )
      .finally(() => this.isConsolidating.delete(uid));
  }

  private async runConsolidation(uid: string): Promise<void> {
    const {
      dateKey: today,
      weekKey: currentWeek,
      monthKey: currentMonth,
    } = this.getTemporalKeys();

    const unconsolidatedDays = db
      .query<{ date_key: string; week_key: string }, [string, string, string]>(
        `SELECT DISTINCT date_key, week_key FROM raw_logs 
         WHERE user_id = ? AND date_key < ? 
         AND date_key NOT IN (SELECT period_key FROM hmt_nodes WHERE user_id = ? AND level = 1)
         ORDER BY date_key ASC LIMIT 2`,
      )
      .all(uid, today, uid);

    for (const day of unconsolidatedDays) {
      const logs = db
        .query<
          { role: string; content: string },
          [string, string]
        >(`SELECT role, content FROM raw_logs WHERE user_id = ? AND date_key = ? ORDER BY created_at ASC`)
        .all(uid, day.date_key);

      if (logs.length === 0) continue;

      const transcript = logs
        .map((l) => `${l.role.toUpperCase()}: ${l.content}`)
        .join("\n");
      const summary = await this.summarizeText(
        `Summarize the events, topics of discussion, and key decisions from ${day.date_key} in a factual and concise manner (maximum 1 paragraph):`,
        transcript,
      );

      db.run(
        `INSERT OR IGNORE INTO hmt_nodes (user_id, level, period_key, parent_period, summary, created_at)
         VALUES (?, 1, ?, ?, ?, ?)`,
        [uid, day.date_key, day.week_key, summary, Date.now()],
      );
      console.log(`[HMT] Created Level 1 (Daily) node for ${day.date_key}`);
    }

    const unconsolidatedWeeks = db
      .query<{ parent_period: string }, [string, string, string]>(
        `SELECT DISTINCT parent_period FROM hmt_nodes 
         WHERE user_id = ? AND level = 1 AND parent_period < ?
         AND parent_period NOT IN (SELECT period_key FROM hmt_nodes WHERE user_id = ? AND level = 2)
         LIMIT 1`,
      )
      .all(uid, currentWeek, uid);

    for (const week of unconsolidatedWeeks) {
      const dailyNodes = db
        .query<{ period_key: string; summary: string }, [string, string]>(
          `SELECT period_key, summary FROM hmt_nodes 
           WHERE user_id = ? AND level = 1 AND parent_period = ? ORDER BY period_key ASC`,
        )
        .all(uid, week.parent_period);

      if (dailyNodes.length === 0) continue;

      const monthParent = dailyNodes[0]!.period_key.slice(0, 7);
      const combinedDaily = dailyNodes
        .map((d) => `[${d.period_key}]: ${d.summary}`)
        .join("\n");
      const weekSummary = await this.summarizeText(
        `Combine the daily summaries for the following ${week.parent_period} weeks into one concise, factual weekly summary:`,
        combinedDaily,
      );

      db.run(
        `INSERT OR IGNORE INTO hmt_nodes (user_id, level, period_key, parent_period, summary, created_at)
         VALUES (?, 2, ?, ?, ?, ?)`,
        [uid, week.parent_period, monthParent, weekSummary, Date.now()],
      );
      console.log(
        `[EPISODIC] Created Level 2 (Weekly) node for ${week.parent_period}`,
      );
    }

    const unconsolidatedMonths = db
      .query<{ parent_period: string }, [string, string, string]>(
        `SELECT DISTINCT parent_period FROM hmt_nodes 
         WHERE user_id = ? AND level = 2 AND parent_period < ?
         AND parent_period NOT IN (SELECT period_key FROM hmt_nodes WHERE user_id = ? AND level = 3)
         LIMIT 1`,
      )
      .all(uid, currentMonth, uid);

    for (const month of unconsolidatedMonths) {
      const weeklyNodes = db
        .query<{ period_key: string; summary: string }, [string, string]>(
          `SELECT period_key, summary FROM hmt_nodes 
           WHERE user_id = ? AND level = 2 AND parent_period = ? ORDER BY period_key ASC`,
        )
        .all(uid, month.parent_period);

      if (weeklyNodes.length === 0) continue;

      const combinedWeekly = weeklyNodes
        .map((w) => `[${w.period_key}]: ${w.summary}`)
        .join("\n");
      const monthSummary = await this.summarizeText(
        `Combine the following weekly summaries for the month of ${month.parent_period} into a single, comprehensive monthly overview (covering key milestones, major topics, and the evolution of the relationship):`,
        combinedWeekly,
      );

      db.run(
        `INSERT OR IGNORE INTO hmt_nodes (user_id, level, period_key, parent_period, summary, created_at)
         VALUES (?, 3, ?, NULL, ?, ?)`,
        [uid, month.parent_period, monthSummary, Date.now()],
      );
      console.log(
        `[EPISODIC] Created Level 3 (Monthly) node for ${month.parent_period}`,
      );
    }
  }

  private async summarizeText(
    instruction: string,
    content: string,
  ): Promise<string> {
    const { text } = await generateText({
      model: openrouter(config.OPENROUTER_BASE_URL, {
        extraBody: { reasoning: { exclude: true, effort: "none" } },
      }),
      system:
        "You are an episodic memory compression engine. Your task is to summarize conversation logs objectively, extractively, and factually, without fabricating any information beyond what is provided in the text.",
      prompt: `${instruction}\n\n---\n${content}`,
      temperature: 0.1,
      maxOutputTokens: 350,
    });

    return text.trim();
  }
}

export const episodic = new HierarchicalEpisodicMemory();
