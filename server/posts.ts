import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { generateManusTaskDraft } from "./_core/manusTask";

export async function generateDraft(userId: number, slotKey?: string) {
  if (slotKey) {
    const existingSlot = await db.getPostBySlot(slotKey);
    if (existingSlot) return { created: false as const, reason: "slot_already_handled" as const, post: existingSlot };
  }
  const settings = await db.getSettings(userId);
  if (settings.paused) return { created: false as const, reason: "paused" as const };
  const pending = await db.getPendingPost(userId);
  if (pending) return { created: false as const, reason: "review_pending" as const, post: pending };
  if (!settings.topics.trim()) return { created: false as const, reason: "topics_required" as const };

  const prompt = [
    "Write one original, short X post for a personal developer account.",
    "Do not mention or imitate any specific creator. Do not copy or closely paraphrase existing posts.",
    "Do not browse, use tools, contact services, publish, or take any external action. Only return draft text.",
    "Do not inject current trends, trending terms, hashtags, or engagement bait.",
    "Use the requested topics and voice naturally. Keep it conversational, specific, and readable.",
    "Do not invent the account owner's personal milestones, purchases, experiences, results, or factual claims.",
    "If no verified personal fact is supplied, write an observation, question, opinion, lesson framed generally, or developer-life joke.",
    "Return only the post text, no quotation marks or explanation. Keep to 240 characters to leave room for editing.",
    `Topics: ${settings.topics.slice(0, 1200)}`,
    `Voice: ${settings.tone.slice(0, 800)}`,
    "Make this draft distinct from generic viral-bait phrasing.",
  ].join("\n");
  const content = (await generateManusTaskDraft(prompt)).trim();
  if (!content) throw new Error("Draft generation returned no usable text");
  if (content.length > 280) throw new Error("Generated draft exceeded the 280-character safety limit");

  try {
    const post = await db.createPost({ userId, content, category: "developer-life", source: "ai", slotKey: slotKey ?? null });
    return { created: true as const, post };
  } catch (error) {
    if (slotKey) {
      const raced = await db.getPostBySlot(slotKey);
      if (raced) return { created: false as const, reason: "slot_already_handled" as const, post: raced };
    }
    throw error;
  }
}

export async function publishApprovedDraft(id: number, userId: number) {
  const token = process.env.X_USER_ACCESS_TOKEN;
  if (!token) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "X is not connected yet. Configure an X OAuth 2.0 user access token in project secrets before approving for publication." });
  }
  const post = await db.getPostForUser(id, userId);
  if (!post || post.status !== "pending") {
    throw new TRPCError({ code: "CONFLICT", message: "This draft is no longer awaiting review." });
  }

  const claimed = await db.updatePendingPost({ id, userId, status: "publishing", approvedAt: new Date(), errorMessage: null });
  if (!claimed) throw new TRPCError({ code: "CONFLICT", message: "This draft is already being handled." });

  let response: Response;
  try {
    response = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: post.content }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    await db.updatePublishingPost({ id, userId, status: "unknown", errorMessage: "No definitive response from X. Check the account before retrying to avoid a duplicate post." });
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The result is uncertain. Check your X account before attempting another post; this draft has been held to prevent duplicates." });
  }

  const body = await response.json().catch(() => ({})) as { data?: { id?: string }; errors?: Array<{ message?: string; detail?: string }> };
  if (!response.ok) {
    const reason = body.errors?.[0]?.detail ?? body.errors?.[0]?.message ?? `X returned HTTP ${response.status}`;
    await db.updatePublishingPost({ id, userId, status: "failed", errorMessage: reason.slice(0, 1000) });
    throw new TRPCError({ code: "BAD_GATEWAY", message: `X did not accept the post: ${reason}` });
  }
  if (!body.data?.id) {
    await db.updatePublishingPost({ id, userId, status: "unknown", errorMessage: "X returned success without a post ID. Verify the account before any retry." });
    throw new TRPCError({ code: "BAD_GATEWAY", message: "X's response did not include a post ID. Check your account before retrying." });
  }

  await db.updatePublishingPost({ id, userId, status: "published", xPostId: body.data.id, publishedAt: new Date(), errorMessage: null });
  return { postId: body.data.id };
}
