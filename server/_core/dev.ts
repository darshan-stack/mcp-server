import "dotenv/config";
import { createServer } from "http";
import { app } from "./index";
import { setupVite } from "./vite";

async function startDevelopmentServer() {
  const httpServer = createServer(app);
  await setupVite(app, httpServer);

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT");
  }

  httpServer.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  httpServer.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startDevelopmentServer().catch(error => {
  console.error(error);
  process.exit(1);
});
