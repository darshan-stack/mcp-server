import type { Request, Response } from "express";
import * as db from "./db";
import { generateDraft } from "./posts";
import { sdk } from "./_core/sdk";

export async function handleScheduledDraft(req: Request, res: Response) {
  try {
    const identity = await sdk.authenticateRequest(req);
    if (!identity.isCron || !identity.taskUid) {
      res.status(401).json({ error: "A valid scheduled-task identity is required." });
      return;
    }
    const settings = await db.getSettingsByTaskUid(identity.taskUid);
    if (!settings) {
      res.status(403).json({ error: "This schedule is not registered to a PostQueue owner." });
      return;
    }
    if (settings.paused) {
      res.status(200).json({ outcome: "paused" });
      return;
    }
    const pending = await db.getPendingPost(settings.userId);
    if (pending) {
      res.status(200).json({ outcome: "review_pending" });
      return;
    }
    const slot = Math.floor(Date.now() / (15 * 60 * 1000));
    const slotKey = `${settings.userId}:${slot}`;
    const outcome = await generateDraft(settings.userId, slotKey);
    res.status(200).json({ outcome: outcome.reason ?? (outcome.created ? "draft_created" : "skipped") });
  } catch (error) {
    console.error("[PostQueue] Scheduled draft failed:", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "Draft generation failed. No post was published." });
  }
}
