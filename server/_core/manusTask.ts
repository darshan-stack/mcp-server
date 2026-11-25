import { ENV } from "./env";

type ManusEvent = {
  type?: string;
  assistant_message?: { content?: unknown };
  error_message?: { content?: unknown };
  status_update?: {
    agent_status?: string;
    status_detail?: {
      waiting_for_event_id?: string;
      waiting_for_event_type?: string;
      waiting_description?: string;
    };
  };
};

type ManusResponse = {
  ok?: boolean;
  task_id?: string;
  task?: { has_running_background_jobs?: boolean };
  messages?: ManusEvent[];
};

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ManusTaskOptions {
  /** Overall deadline. Kept below the configured Vercel function duration. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchImplementation;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const MAX_REQUEST_TIMEOUT_MS = 8_000;
const DRAFT_TITLE = "PostQueue draft generation";

function getApiBaseUrl(): string {
  const configured = ENV.forgeApiUrl.trim();
  if (!configured) throw new Error("MANUS_API_URL is not configured. Set it to https://api.manus.ai.");

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("MANUS_API_URL must be the Manus API base URL, such as https://api.manus.ai.");
  }
  if (parsed.protocol !== "https:" || (parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) {
    throw new Error("MANUS_API_URL must be the HTTPS Manus API base URL, such as https://api.manus.ai.");
  }
  return parsed.origin;
}

function getApiKey(): string {
  const key = ENV.forgeApiKey.trim();
  if (!key) throw new Error("MANUS_API_KEY is not configured.");
  return key;
}

function apiError(status: number): Error {
  if (status === 401 || status === 403) {
    return new Error(`Manus API authentication failed (HTTP ${status}). Check the server-side MANUS_API_KEY configuration.`);
  }
  if (status === 404) {
    return new Error("Manus API returned HTTP 404. MANUS_API_URL must be https://api.manus.ai and the key must have task API access.");
  }
  return new Error(`Manus task API request failed (HTTP ${status}). No draft was saved.`);
}

function parseJson(value: unknown): ManusResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ManusResponse;
}

function getLatestStatusEvent(messages: ManusEvent[] | undefined): ManusEvent | undefined {
  if (!Array.isArray(messages)) return undefined;
  return messages.find(event => event?.type === "status_update" && typeof event.status_update?.agent_status === "string");
}

function extractAssistantText(messages: ManusEvent[] | undefined): string {
  if (!Array.isArray(messages)) return "";
  const latestAssistantMessage = messages.find(event => event?.type === "assistant_message");
  const text = latestAssistantMessage?.assistant_message?.content;
  return typeof text === "string" ? text.trim() : "";
}

function extractTaskError(messages: ManusEvent[] | undefined): string {
  if (!Array.isArray(messages)) return "";
  const event = messages.find(item => item?.type === "error_message");
  const content = event?.error_message?.content;
  return typeof content === "string" ? content.trim().slice(0, 500) : "";
}

function cleanDraftText(text: string): string {
  return text
    .trim()
    .replace(/^\s*(?:draft\s*:\s*)/i, "")
    .replace(/^['“”"]|['“”"]$/g, "")
    .trim();
}

/**
 * Creates one private Manus agent task for a draft and polls the documented
 * status_update events. It never confirms waiting actions and never publishes to X.
 */
export async function generateManusTaskDraft(prompt: string, options: ManusTaskOptions = {}): Promise<string> {
  const apiBaseUrl = getApiBaseUrl();
  const apiKey = getApiKey();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + timeoutMs;

  async function requestJson(url: string, init: RequestInit): Promise<ManusResponse> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Manus draft generation timed out. No draft was saved.");

    let response: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set("x-manus-api-key", apiKey);
      response = await fetchImpl(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(Math.min(MAX_REQUEST_TIMEOUT_MS, remaining)),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("Manus API request timed out. No draft was saved.");
      }
      throw new Error("Could not reach the Manus API. No draft was saved.");
    }

    const payload = parseJson(await response.json().catch(() => null));
    if (!response.ok || payload.ok === false) throw apiError(response.status);
    return payload;
  }

  const created = await requestJson(`${apiBaseUrl}/v2/task.create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { content: prompt },
      title: DRAFT_TITLE,
      agent_profile: "lite",
      interactive_mode: false,
      share_visibility: "private",
      hide_in_task_list: false,
      clear_connectors: true,
    }),
  });
  const taskId = typeof created.task_id === "string" ? created.task_id.trim() : "";
  if (!taskId) throw new Error("Manus API did not return a task ID. No draft was saved.");

  const taskUrl = `https://manus.im/app/${encodeURIComponent(taskId)}`;
  const messagesUrl = new URL(`${apiBaseUrl}/v2/task.listMessages`);
  messagesUrl.searchParams.set("task_id", taskId);
  messagesUrl.searchParams.set("order", "desc");
  messagesUrl.searchParams.set("limit", "50");

  const detailUrl = new URL(`${apiBaseUrl}/v2/task.detail`);
  detailUrl.searchParams.set("task_id", taskId);

  while (Date.now() < deadline) {
    const progress = await requestJson(messagesUrl.toString(), { method: "GET" });
    const latestStatus = getLatestStatusEvent(progress.messages)?.status_update;
    const status = latestStatus?.agent_status;

    if (status === "waiting") {
      const waitingType = latestStatus?.status_detail?.waiting_for_event_type;
      const waitingDescription = latestStatus?.status_detail?.waiting_description;
      const context = [waitingType, waitingDescription].filter(Boolean).join(": ");
      throw new Error(`Manus task is waiting for user input or approval${context ? ` (${context})` : ""}. Open ${taskUrl} to inspect it. No draft was saved; no action was confirmed automatically.`);
    }
    if (status === "error") {
      const detail = extractTaskError(progress.messages);
      throw new Error(`Manus task failed${detail ? `: ${detail}` : ""}. No draft was saved.`);
    }
    if (status === "stopped") {
      const detail = await requestJson(detailUrl.toString(), { method: "GET" });
      if (detail.task?.has_running_background_jobs === false) {
        const content = cleanDraftText(extractAssistantText(progress.messages));
        if (!content) throw new Error("Manus task completed without usable assistant text. No draft was saved.");
        return content;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }

  throw new Error(`Manus draft generation timed out. The task may still be running; check ${taskUrl} before retrying. No draft was saved.`);
}
