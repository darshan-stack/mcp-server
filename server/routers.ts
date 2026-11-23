import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { z } from "zod";
import * as db from "./db";
import { generateDraft, publishApprovedDraft } from "./posts";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { getSessionCookieOptions } from "./_core/cookies";

function sessionTokenFromRequest(req: { headers: { cookie?: string; authorization?: string } }) {
  const cookieToken = req.headers.cookie ? parseCookieHeader(req.headers.cookie)[COOKIE_NAME] : undefined;
  if (cookieToken) return cookieToken;
  const authorization = req.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  posts: router({
    list: adminProcedure.query(({ ctx }) => db.listPosts(ctx.user.id)),
    create: adminProcedure.input(z.object({ content: z.string().trim().min(1).max(280), category: z.string().trim().max(32).default("manual") })).mutation(async ({ ctx, input }) => {
      return db.createPost({ userId: ctx.user.id, content: input.content, category: input.category || "manual", source: "manual" });
    }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), content: z.string().trim().min(1).max(280) })).mutation(async ({ ctx, input }) => {
      const saved = await db.updatePendingPost({ id: input.id, userId: ctx.user.id, content: input.content });
      if (!saved) throw new Error("This draft is no longer editable.");
      return { success: true };
    }),
    reject: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const saved = await db.updatePendingPost({ id: input.id, userId: ctx.user.id, status: "rejected", approvedAt: null });
      if (!saved) throw new Error("This draft is no longer awaiting review.");
      return { success: true };
    }),
    approveAndPublish: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      return publishApprovedDraft(input.id, ctx.user.id);
    }),
    generate: adminProcedure.mutation(async ({ ctx }) => {
      return generateDraft(ctx.user.id);
    }),
  }),
  settings: router({
    get: adminProcedure.query(async ({ ctx }) => {
      const settings = await db.getSettings(ctx.user.id);
      return {
        topics: settings.topics,
        tone: settings.tone,
        paused: Boolean(settings.paused),
        scheduleEnabled: Boolean(settings.generationTaskUid),
        xConnected: Boolean(process.env.X_USER_ACCESS_TOKEN),
        canSchedule: process.env.NODE_ENV === "production",
      };
    }),
    update: adminProcedure.input(z.object({ topics: z.string().trim().max(1200), tone: z.string().trim().max(800) })).mutation(async ({ ctx, input }) => {
      const settings = await db.updateSettings(ctx.user.id, input);
      return { topics: settings.topics, tone: settings.tone };
    }),
    setPaused: adminProcedure.input(z.object({ paused: z.boolean() })).mutation(async ({ ctx, input }) => {
      const current = await db.getSettings(ctx.user.id);
      if (current.generationTaskUid) {
        await updateHeartbeatJob(current.generationTaskUid, { enable: !input.paused }, sessionTokenFromRequest(ctx.req));
      }
      const settings = await db.updateSettings(ctx.user.id, { paused: input.paused ? 1 : 0 });
      return { paused: Boolean(settings.paused), scheduleEnabled: Boolean(settings.generationTaskUid) };
    }),
    enableSchedule: adminProcedure.mutation(async ({ ctx }) => {
      if (process.env.NODE_ENV !== "production") {
        throw new Error("The recurring job can be registered after the app is published. Draft generation is not running yet.");
      }
      const current = await db.getSettings(ctx.user.id);
      if (current.generationTaskUid) {
        await updateHeartbeatJob(current.generationTaskUid, { enable: true }, sessionTokenFromRequest(ctx.req));
        await db.updateSettings(ctx.user.id, { paused: 0 });
        return { enabled: true };
      }
      const created = await createHeartbeatJob({
        name: "postqueue-draft-generator",
        cron: "0 */15 * * * *",
        path: "/api/scheduled/generate-draft",
        method: "POST",
        payload: {},
        description: "Create at most one original X post draft every 15 minutes when the review queue is clear; never publish without owner approval.",
      }, sessionTokenFromRequest(ctx.req));
      await db.setGenerationTaskUid(ctx.user.id, created.taskUid);
      await db.updateSettings(ctx.user.id, { paused: 0 });
      return { enabled: true, nextExecutionAt: created.nextExecutionAt ?? null };
    }),
  }),
});

export type AppRouter = typeof appRouter;
