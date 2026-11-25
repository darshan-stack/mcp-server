import { afterEach, describe, expect, it, vi } from "vitest";
import { generateManusTaskDraft } from "./manusTask";

afterEach(() => {
  vi.unstubAllEnvs();
});

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function configureApi() {
  vi.stubEnv("MANUS_API_URL", "https://api.manus.ai");
  vi.stubEnv("MANUS_API_KEY", "unit-test-key");
}

describe("Manus task-backed draft generation", () => {
  it("creates a private, connector-free task and returns its assistant text after it stops", async () => {
    configureApi();
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ ok: true, task_id: "task-123" }))
      .mockResolvedValueOnce(ok({ ok: true, task: { status: "running" } }))
      .mockResolvedValueOnce(ok({ ok: true, task: { status: "stopped" } }))
      .mockResolvedValueOnce(ok({
        ok: true,
        messages: [
          { type: "assistant_message", assistant_message: { content: "\"A small draft about shipping one useful improvement.\"" } },
          { type: "status_update", status_update: { agent_status: "stopped" } },
        ],
      }));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request, pollIntervalMs: 0 }))
      .resolves.toBe("A small draft about shipping one useful improvement.");

    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[0]?.[0]).toBe("https://api.manus.ai/v2/task.create");
    const headers = new Headers(request.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-manus-api-key")).toBe("unit-test-key");
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      title: "PostQueue draft generation",
      agent_profile: "lite",
      interactive_mode: false,
      share_visibility: "private",
      hide_in_task_list: false,
      clear_connectors: true,
      message: { content: "Generate a draft" },
    });
    expect(String(request.mock.calls[1]?.[0])).toContain("/v2/task.detail?task_id=task-123");
    expect(String(request.mock.calls[3]?.[0])).toContain("/v2/task.listMessages?");
  });

  it("does not accept or confirm a task waiting for user input", async () => {
    configureApi();
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ ok: true, task_id: "task-wait" }))
      .mockResolvedValueOnce(ok({ ok: true, task: { status: "waiting" } }));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.toThrow("waiting for user input or approval");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("fails safely when the Manus task enters error state", async () => {
    configureApi();
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ ok: true, task_id: "task-error" }))
      .mockResolvedValueOnce(ok({ ok: true, task: { status: "error" } }));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.toThrow("Manus task failed");
  });

  it("does not return a draft if the task completes without assistant text", async () => {
    configureApi();
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ ok: true, task_id: "task-empty" }))
      .mockResolvedValueOnce(ok({ ok: true, task: { status: "stopped" } }))
      .mockResolvedValueOnce(ok({ ok: true, messages: [] }));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.toThrow("without usable assistant text");
  });

  it("does not fall back to an older assistant message when the newest output is empty", async () => {
    configureApi();
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ ok: true, task_id: "task-empty-latest" }))
      .mockResolvedValueOnce(ok({ ok: true, task: { status: "stopped" } }))
      .mockResolvedValueOnce(ok({
        ok: true,
        messages: [
          { type: "assistant_message", assistant_message: { content: "" } },
          { type: "assistant_message", assistant_message: { content: "Older non-final text." } },
        ],
      }));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.toThrow("without usable assistant text");
  });

  it("does not save text while Manus is still running past the poll deadline", async () => {
    configureApi();
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ ok: true, task_id: "task-running" }))
      .mockResolvedValue(ok({ ok: true, task: { status: "running" } }));

    await expect(generateManusTaskDraft("Generate a draft", {
      fetchImpl: request,
      timeoutMs: 5,
      pollIntervalMs: 20,
    })).rejects.toThrow("timed out");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reports API authentication failures without exposing the configured key", async () => {
    configureApi();
    const request = vi.fn().mockResolvedValue(ok({ ok: false }, 401));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.toThrow("authentication failed (HTTP 401)");
    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.not.toThrow("unit-test-key");
  });

  it("explains a Manus API 404 without suggesting the chat-completions endpoint", async () => {
    configureApi();
    const request = vi.fn().mockResolvedValue(ok({ ok: false }, 404));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.toThrow("MANUS_API_URL must be https://api.manus.ai");
    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.not.toThrow("unit-test-key");
  });

  it("rejects malformed task-create responses instead of guessing a task ID", async () => {
    configureApi();
    const request = vi.fn().mockResolvedValue(ok({ ok: true }));

    await expect(generateManusTaskDraft("Generate a draft", { fetchImpl: request }))
      .rejects.toThrow("did not return a task ID");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
