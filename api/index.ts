/**
 * Vercel serverless function entry point.
 *
 * Imports the shared Express app from server/_core/index and exports it as
 * the default handler. Vercel routes all /api/* requests to this function.
 *
 * Routes handled by the Express app:
 *   GET  /api/health
 *   GET  /api/platform/config.js
 *   POST /api/scheduled/generate-draft
 *   GET  /api/oauth/callback
 *   ALL  /api/trpc/*
 *
 * Static assets and SPA fallback are served from `dist/public` via vercel.json.
 */

import { app } from "../server/_core/index";

export default app;
