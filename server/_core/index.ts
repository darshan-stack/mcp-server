import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleScheduledDraft } from "../scheduled";

// Create the Express app - exported so it can be imported by Vercel serverless.
export const app = express();

// Configure body parser with larger size limit for file uploads.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/scheduled/generate-draft", handleScheduledDraft);

// tRPC API.
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);
