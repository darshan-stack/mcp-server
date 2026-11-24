import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import * as db from "./db";
import { generateDraft } from "./posts";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";

const jsonResult = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function createPostQueueServer() {
  const server = new McpServer({ name: "postqueue", version: "1.0.0" });

  server.registerTool(
    "postqueue_get_settings",
    {
      description: "Read the PostQueue writing preferences and automation status. Never returns credentials or access tokens.",
    },
    async () => {
      const owner = await db.ensureLocalOwner();
      const settings = await db.getSettings(owner.id);
      return jsonResult({
        topics: settings.topics,
        tone: settings.tone,
        paused: Boolean(settings.paused),
        scheduleEnabled: Boolean(settings.generationTaskUid),
        xConnected: Boolean(process.env.X_USER_ACCESS_TOKEN),
      });
    }
  );

  server.registerTool(
    "postqueue_list_posts",
    {
      description: "List the owner's recent drafts and post history. This is read-only and never publishes anything.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        status: z.enum(["pending", "publishing", "published", "rejected", "failed", "unknown"]).optional(),
      }),
    },
    async ({ limit, status }) => {
      const owner = await db.ensureLocalOwner();
      const posts = await db.listPosts(owner.id, 100);
      const filtered = (status ? posts.filter(post => post.status === status) : posts).slice(0, limit ?? 30);
      return jsonResult({
        posts: filtered.map(post => ({
          id: post.id,
          content: post.content,
          status: post.status,
          category: post.category,
          source: post.source,
          createdAt: asIso(post.createdAt),
          updatedAt: asIso(post.updatedAt),
          publishedAt: asIso(post.publishedAt),
          xPostId: post.xPostId,
          errorMessage: post.errorMessage,
        })),
      });
    }
  );

  server.registerTool(
    "postqueue_update_settings",
    {
      description: "Update the writing topics and/or tone used for future drafts. This does not publish a post.",
      inputSchema: z.object({
        topics: z.string().trim().max(1200).optional(),
        tone: z.string().trim().max(800).optional(),
      }).refine(value => value.topics !== undefined || value.tone !== undefined, "Provide topics, tone, or both."),
    },
    async input => {
      const owner = await db.ensureLocalOwner();
      const settings = await db.updateSettings(owner.id, input);
      return jsonResult({ topics: settings.topics, tone: settings.tone });
    }
  );

  server.registerTool(
    "postqueue_generate_draft",
    {
      description: "Generate at most one unpublished review draft using the saved topics and tone. Existing pending drafts and paused generation are respected. This tool cannot publish to X.",
    },
    async () => {
      const owner = await db.ensureLocalOwner();
      const result = await generateDraft(owner.id);
      return jsonResult({
        created: result.created,
        reason: "reason" in result ? result.reason : null,
        post: result.post ? {
          id: result.post.id,
          content: result.post.content,
          status: result.post.status,
          category: result.post.category,
          createdAt: asIso(result.post.createdAt),
        } : null,
        published: false,
      });
    }
  );

  server.registerTool(
    "postqueue_manage_schedule",
    {
      description: "Manage the existing 15-minute draft-generation schedule. Enable creates it if absent; pause stops it; resume restarts an existing schedule. It only creates drafts and never publishes to X.",
      inputSchema: z.object({ action: z.enum(["enable", "pause", "resume"]) }),
    },
    async ({ action }) => {
      if (process.env.NODE_ENV !== "production") {
        throw new Error("The recurring draft schedule can only be managed in the production deployment.");
      }
      const owner = await db.ensureLocalOwner();
      let settings = await db.getSettings(owner.id);
      if (action === "pause") {
        if (settings.generationTaskUid) {
          await updateHeartbeatJob(settings.generationTaskUid, { enable: false }, "");
        }
        settings = await db.updateSettings(owner.id, { paused: 1 });
        return jsonResult({ action, scheduleEnabled: Boolean(settings.generationTaskUid), paused: true });
      }
      if (action === "resume" && !settings.generationTaskUid) {
        return jsonResult({ action, scheduleEnabled: false, paused: Boolean(settings.paused), reason: "no_schedule_exists; use action=enable to create it" });
      }
      if (settings.generationTaskUid) {
        await updateHeartbeatJob(settings.generationTaskUid, { enable: true }, "");
      } else {
        const created = await createHeartbeatJob({
          name: "postqueue-draft-generator",
          cron: "0 */15 * * * *",
          path: "/api/scheduled/generate-draft",
          method: "POST",
          payload: {},
          description: "Create at most one original X post draft every 15 minutes when the review queue is clear; never publish without owner approval.",
        }, "");
        await db.setGenerationTaskUid(owner.id, created.taskUid);
      }
      settings = await db.updateSettings(owner.id, { paused: 0 });
      return jsonResult({ action, scheduleEnabled: Boolean(settings.generationTaskUid), paused: false });
    }
  );

  return server;
}

export const postQueueMcpHandler = createMcpHandler(createPostQueueServer, {
  onerror: error => console.error("[PostQueue MCP] Request failed:", error.message),
});
