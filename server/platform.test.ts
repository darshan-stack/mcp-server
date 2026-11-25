import { afterEach, describe, expect, it, vi } from "vitest";
import { publicPlatformConfig, publicPlatformScript } from "./_core/publicConfig";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { COOKIE_NAME } from "../shared/const";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("current platform integration", () => {
  it("keeps browser platform config empty for the self-managed deployment", () => {
    const config = { projectId: "", oauthPortalUrl: "", apiUrl: "", apiBrowserKey: "" };
    expect(publicPlatformConfig()).toEqual(config);
    const windowLike: Record<string, unknown> = {};
    new Function("window", "document", publicPlatformScript())(windowLike, {});
    expect(windowLike.__MANUS_CONFIG__).toEqual(config);
  });
  it("does not guess a production API when the project environment is absent", async () => {
    vi.stubEnv("MANUS_API_URL", ""); vi.stubEnv("MANUS_API_KEY", "test-only");
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(listLLMModels()).rejects.toThrow("MANUS_API_URL");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    ["https://api.example", "https://api.example/v1/chat/completions"],
    ["https://api.example/v1/", "https://api.example/v1/chat/completions"],
    ["https://api.example/v1/chat/completions", "https://api.example/v1/chat/completions"],
  ])("normalizes the configured LLM endpoint %s", async (apiUrl, expectedUrl) => {
    vi.stubEnv("MANUS_API_URL", apiUrl);
    vi.stubEnv("MANUS_API_KEY", "test-only");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "A safe test draft." } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", request);

    await expect(invokeLLM({ messages: [{ role: "user", content: "Write a test draft." }] }))
      .resolves.toMatchObject({ choices: [{ message: { content: "A safe test draft." } }] });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(expectedUrl);
  });
  it("does not retry 404 and explains the required Manus API base URL safely", async () => {
    vi.stubEnv("MANUS_API_URL", "https://api.example");
    vi.stubEnv("MANUS_API_KEY", "test-only");
    const request = vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 }));
    vi.stubGlobal("fetch", request);

    await expect(invokeLLM({ messages: [{ role: "user", content: "Write a test draft." }] }))
      .rejects.toThrow("MANUS_API_URL: it must be the Manus API base URL");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("persists URL-only image results through current managed storage", async () => {
    vi.stubEnv("MANUS_API_URL", "https://api.example"); vi.stubEnv("MANUS_API_KEY", "test-only");
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ image: { url: "https://image.example/result.png", mimeType: "image/png" } })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://upload.example/object" })))
      .mockResolvedValueOnce(new Response(""));
    vi.stubGlobal("fetch", request);
    const image = await generateImage({ prompt: "test", originalImages: [] });
    expect(image.url).toMatch(/^\/manus-storage\/generated\//);
    expect(request).toHaveBeenCalledTimes(4);
    expect(JSON.parse(request.mock.calls[0][1].body)).toHaveProperty("originalImages");
  });
  it("uses a distinct secure app cookie behind the HTTPS Preview proxy", () => {
    expect(COOKIE_NAME).not.toBe("app_session_id");
    expect(getSessionCookieOptions({ protocol: "http", headers: {} } as never)).toMatchObject({ secure: true, httpOnly: true, sameSite: "none" });
  });
  it("binds signed app sessions to this project and accepts an empty display name", async () => {
    vi.stubEnv("MANUS_PROJECT_ID", "project-test");
    vi.stubEnv("MANUS_JWT_SECRET", "unit-test-signing-key-never-deployed");
    const token = await sdk.signSession({ openId: "user-test", appId: "project-test", name: "" });
    expect(await sdk.verifySession(token)).toMatchObject({ openId: "user-test" });
    vi.stubEnv("MANUS_PROJECT_ID", "different-project");
    expect(await sdk.verifySession(token)).toBeNull();
  });
});
