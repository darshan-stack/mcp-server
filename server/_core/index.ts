import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleScheduledDraft } from "../scheduled";
import { timingSafeEqual } from "node:crypto";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { postQueueMcpHandler } from "../mcp";

// Create the Express app - exported so it can be imported by Vercel serverless.
export const app = express();

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
const mcpNodeHandler = toNodeHandler(postQueueMcpHandler);
app.all("/api/mcp", (req, res, next) => {
  const expected = process.env.MCP_ACCESS_TOKEN;
  const authorization = req.headers.authorization ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || expected.length < 32) {
    res.status(503).json({ error: "MCP_ACCESS_TOKEN must be configured as a strong, 32-character-or-longer secret." });
    return;
  }
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  const authorized = expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
  if (!authorized) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="PostQueue MCP"');
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}, express.json({ limit: "4mb" }), (req, res) => {
  void mcpNodeHandler(req, res, req.body).catch(error => {
    console.error("[PostQueue MCP] HTTP adapter failed:", error);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed." });
    else res.end();
  });
});

// Body parser for the dashboard API and file uploads.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.post("/api/scheduled/generate-draft", handleScheduledDraft);

// tRPC API.
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);
