// Vercel serverless entrypoint for the Express application.
// The rewrite in vercel.json forwards the wildcard API path as `?path=...`.
let appPromise;

function loadApp() {
  if (!appPromise) {
    appPromise = import("../dist/index.js").then(({ app }) => {
      if (typeof app !== "function") {
        throw new TypeError("The bundled Express app was not exported as a function");
      }
      return app;
    });
  }
  return appPromise;
}

const isSupportedApiPath = (path) =>
  path === "health" ||
  path === "mcp" ||
  path === "trpc" ||
  path.startsWith("trpc/") ||
  path === "scheduled/generate-draft";

export default async function handler(req, res) {
  const requestUrl = new URL(req.url || "/", "http://vercel.local");
  const capturedPath = requestUrl.searchParams.get("path");
  const apiPath = capturedPath?.replace(/^\/+/, "");

  if (
    !apiPath ||
    apiPath.split("/").includes("..") ||
    !isSupportedApiPath(apiPath)
  ) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  requestUrl.searchParams.delete("path");
  req.url = `/api/${apiPath}${requestUrl.search}`;
  req.originalUrl = req.url;

  try {
    const app = await loadApp();
    return app(req, res);
  } catch (error) {
    console.error("[vercel-function] Failed to load the Express app:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}
