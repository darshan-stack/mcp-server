import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { app } from "./_core/index";

const token = "test-mcp-token-".repeat(4);
const priorToken = process.env.MCP_ACCESS_TOKEN;
let server: ReturnType<typeof app.listen>;
let endpoint: string;

describe("PostQueue MCP endpoint", () => {
  beforeAll(async () => {
    process.env.MCP_ACCESS_TOKEN = token;
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
    endpoint = `http://127.0.0.1:${address.port}/api/mcp`;
  });

  afterAll(async () => {
    if (priorToken === undefined) delete process.env.MCP_ACCESS_TOKEN;
    else process.env.MCP_ACCESS_TOKEN = priorToken;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("rejects missing credentials and fails closed on a weak configured secret", async () => {
    const missing = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(missing.status).toBe(401);

    process.env.MCP_ACCESS_TOKEN = "too-short";
    const weak = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer too-short" },
      body: "{}",
    });
    expect(weak.status).toBe(503);
    process.env.MCP_ACCESS_TOKEN = token;
  });

  it("serves the draft-only tool set over Streamable HTTP", async () => {
    const client = new Client({ name: "postqueue-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    try {
      await client.connect(transport);
      const result = await client.listTools();
      const names = result.tools.map(tool => tool.name).sort();
      expect(names).toEqual([
        "postqueue_generate_draft",
        "postqueue_get_settings",
        "postqueue_list_posts",
        "postqueue_manage_schedule",
        "postqueue_update_settings",
      ]);
      expect(names.some(name => name.includes("publish"))).toBe(false);
    } finally {
      await client.close();
    }
  });
});
