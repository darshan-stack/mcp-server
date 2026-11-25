import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { publishApprovedDraft } from "./posts";

vi.mock("./db", () => ({
  getPostForUser: vi.fn(),
  updatePendingPost: vi.fn(),
  updatePublishingPost: vi.fn(),
}));

describe("publishApprovedDraft X error handling", () => {
  beforeEach(() => {
    vi.stubEnv("X_USER_ACCESS_TOKEN", "test-user-token");
    vi.mocked(db.getPostForUser).mockResolvedValue({
      id: 4,
      userId: 9,
      status: "pending",
      content: "A test draft",
    } as never);
    vi.mocked(db.updatePendingPost).mockResolvedValue(true as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("surfaces X's top-level detail and records a rejected post as failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: "Forbidden",
      detail: "The user access token is missing the tweet.write scope.",
    }), { status: 403, headers: { "Content-Type": "application/json" } })));

    await expect(publishApprovedDraft(4, 9)).rejects.toThrow(
      "X did not accept the post: The user access token is missing the tweet.write scope.",
    );
    expect(db.updatePublishingPost).toHaveBeenCalledWith(expect.objectContaining({
      id: 4,
      userId: 9,
      status: "failed",
      errorMessage: "The user access token is missing the tweet.write scope.",
    }));
  });

  it("provides scope and app-permission guidance when X returns an opaque 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));

    await expect(publishApprovedDraft(4, 9)).rejects.toThrow(
      "tweet.write, tweet.read, and users.read scopes, and that the X app has Read and Write permissions.",
    );
    expect(db.updatePublishingPost).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
