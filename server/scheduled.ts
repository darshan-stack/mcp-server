import type { Request, Response } from "express";
import * as db from "./db";
import { generateDraft } from "./posts";

// Local owner user id used when Manus OAuth is bypassed
const LOCAL_OWNER_USER_ID = 1;

export async function handleScheduledDraft(req: Request, res: Response) {
  try {
    // Local mode — skip Manus cron authentication.
    // The schedule endpoint is only reachable if you wire it up in your
    // own cron/Vercel Cron job; it generates one draft for the local owner.
    const userId = LOCAL_OWNER_USER_ID;

    const settings = await db.getSettings(userId);
    if (!settings) {
      res.status(403).json({ error: "No settings found for local owner." });
      return;
    }
    if (settings.paused) {
      res.status(200).json({ outcome: "paused" });
      return;
    }
    const pending = await db.getPendingPost(userId);
    if (pending) {
      res.status(200).json({ outcome: "review_pending" });
      return;
    }
    const slot = Math.floor(Date.now() / (15 * 60 * 1000));
    const slotKey = `${userId}:${slot}`;
    const outcome = await generateDraft(userId, slotKey);
    res.status(200).json({ outcome: outcome.reason ?? (outcome.created ? "draft_created" : "skipped") });
  } catch (error) {
    console.error("[PostQueue] Scheduled draft failed:", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "Draft generation failed. No post was published." });
  }
}
