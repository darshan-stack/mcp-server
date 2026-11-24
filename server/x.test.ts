import { afterEach, describe, expect, it, vi } from "vitest";
import { getXCurrentUser, searchXRecentPosts, XApiError } from "./x";

afterEach(() => vi.unstubAllGlobals());

describe("PostQueue read-only X API helpers", () => {
  it("verifies the OAuth user token through the current-user endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "42", name: "Darshan", username: "darshan_dev" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getXCurrentUser("opaque-test-token")).resolves.toEqual({
      id: "42", name: "Darshan", username: "darshan_dev",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain("/2/users/me?");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer opaque-test-token");
  });

  it("searches recent posts and safely maps author and engagement fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "9001", text: "A useful open-source release", author_id: "42",
        created_at: "2026-11-24T10:00:00.000Z",
        public_metrics: { like_count: 12, retweet_count: 3, reply_count: 4 },
      }],
      includes: { users: [{ id: "42", name: "Darshan", username: "darshan_dev" }] },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const posts = await searchXRecentPosts("opaque-test-token", "open source", 10);
    expect(posts).toEqual([{
      id: "9001", text: "A useful open-source release", authorId: "42",
      authorUsername: "darshan_dev", authorName: "Darshan",
      createdAt: "2026-11-24T10:00:00.000Z", likeCount: 12, repostCount: 3, replyCount: 4,
    }]);
    const [url] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/2/tweets/search/recent");
    expect(url.searchParams.get("query")).toBe("open source");
    expect(url.searchParams.get("max_results")).toBe("10");
  });

  it("reports invalid token and insufficient access without exposing the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getXCurrentUser("secret-not-to-leak")).rejects.toThrow(/X rejected the access token/);
    await expect(getXCurrentUser("secret-not-to-leak")).rejects.not.toThrow("secret-not-to-leak");
  });

  it("rejects invalid search inputs without calling X", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchXRecentPosts("token", "  ")).rejects.toBeInstanceOf(XApiError);
    await expect(searchXRecentPosts("token", "query", 9)).rejects.toThrow(/10 to 100/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
