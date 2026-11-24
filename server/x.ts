export interface XUser {
  id: string;
  name: string;
  username: string;
}

export interface XPost {
  id: string;
  text: string;
  authorId: string | null;
  authorUsername: string | null;
  authorName: string | null;
  createdAt: string | null;
  likeCount: number | null;
  repostCount: number | null;
  replyCount: number | null;
}

interface XApiErrorBody {
  title?: string;
  detail?: string;
  errors?: Array<{ message?: string; detail?: string }>;
}

interface XUserResponse {
  data?: { id?: string; name?: string; username?: string };
}

interface XSearchResponse {
  data?: Array<{
    id?: string;
    text?: string;
    author_id?: string;
    created_at?: string;
    public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number };
  }>;
  includes?: { users?: Array<{ id?: string; name?: string; username?: string }> };
}

export class XApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XApiError";
  }
}

async function getXJson<T>(token: string, url: URL): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new XApiError("Could not reach X. Check the deployment's network access and try again.");
  }

  const body = await response.json().catch(() => ({})) as T & XApiErrorBody;
  if (!response.ok) {
    if (response.status === 401) {
      throw new XApiError("X rejected the access token (HTTP 401). Confirm X_USER_ACCESS_TOKEN is a valid, active OAuth 2.0 user access token with the required scopes.");
    }
    if (response.status === 403) {
      const detail = body.errors?.[0]?.detail ?? body.errors?.[0]?.message ?? body.detail ?? body.title;
      throw new XApiError(`X denied this read request (HTTP 403). Check the token's user-read permissions and whether your X API plan allows this endpoint.${detail ? ` X says: ${detail.slice(0, 240)}` : ""}`);
    }
    if (response.status === 429) {
      throw new XApiError("X rate-limited this request (HTTP 429). Wait before trying again.");
    }
    const detail = body.errors?.[0]?.detail ?? body.errors?.[0]?.message ?? body.detail ?? body.title;
    throw new XApiError(`X API returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : "."}`);
  }
  return body;
}

export async function getXCurrentUser(token: string): Promise<XUser> {
  const url = new URL("https://api.x.com/2/users/me");
  url.searchParams.set("user.fields", "id,name,username");
  const response = await getXJson<XUserResponse>(token, url);
  const user = response.data;
  if (!user?.id || !user.username) {
    throw new XApiError("X returned a successful response without the expected account details.");
  }
  return { id: user.id, name: user.name ?? "", username: user.username };
}

export async function searchXRecentPosts(token: string, query: string, limit = 20): Promise<XPost[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 512) {
    throw new XApiError("Search query must contain 1 to 512 characters.");
  }
  if (!Number.isInteger(limit) || limit < 10 || limit > 100) {
    throw new XApiError("Search result limit must be an integer from 10 to 100.");
  }

  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", normalizedQuery);
  url.searchParams.set("max_results", String(limit));
  url.searchParams.set("tweet.fields", "author_id,created_at,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "id,name,username");

  const response = await getXJson<XSearchResponse>(token, url);
  const users = new Map((response.includes?.users ?? []).flatMap(user =>
    user.id ? [[user.id, { username: user.username ?? null, name: user.name ?? null }] as const] : []
  ));

  return (response.data ?? []).flatMap(post => {
    if (!post.id || typeof post.text !== "string") return [];
    const author = post.author_id ? users.get(post.author_id) : undefined;
    return [{
      id: post.id,
      text: post.text,
      authorId: post.author_id ?? null,
      authorUsername: author?.username ?? null,
      authorName: author?.name ?? null,
      createdAt: post.created_at ?? null,
      likeCount: post.public_metrics?.like_count ?? null,
      repostCount: post.public_metrics?.retweet_count ?? null,
      replyCount: post.public_metrics?.reply_count ?? null,
    }];
  });
}
