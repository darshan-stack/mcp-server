# PostQueue MCP Server

PostQueue exposes an authenticated, stateless MCP server over Streamable HTTP at:

```text
https://mcp-server-one-delta.vercel.app/api/mcp
```

The server uses the official Model Context Protocol TypeScript SDK. It exposes these tools:

- `postqueue_get_settings` — read writing preferences and schedule/X connection status; never returns credentials.
- `postqueue_list_posts` — read recent drafts and post history, optionally filtered by status.
- `postqueue_update_settings` — change the saved topics and/or writing tone.
- `postqueue_generate_draft` — create one unpublished draft, respecting paused generation and an existing pending draft.
- `postqueue_manage_schedule` — enable, pause, or resume the 15-minute draft-generation schedule.

There is deliberately no MCP tool for publishing to X. Publishing remains a separate manual approval action in the PostQueue dashboard.

## Configure access

Use a separate secret for MCP access. Do not reuse the website password or X token. Generate a strong key locally, for example:

```sh
openssl rand -hex 32
```

In Vercel, open the `mcp-server` project’s **Settings → Environment Variables**, add `MCP_ACCESS_TOKEN` with that value for **Production**, and redeploy the project. The value must be at least 32 characters. Do not paste it into GitHub, this documentation, or a chat. The MCP endpoint returns `503` until this variable is configured and `401` for an invalid bearer token.

Configure your MCP client with the endpoint above and send the generated value as an HTTP bearer token:

```http
Authorization: Bearer <your MCP_ACCESS_TOKEN>
```

Client-specific setup varies. This endpoint uses Streamable HTTP (not stdio), so use the remote HTTP MCP connection option in the chosen client.

## Safety and scheduling behavior

The schedule creates at most one draft per run when the queue is clear. If a draft is waiting for review, the next run skips generation. The schedule never publishes. Enabling the schedule starts 15-minute draft generation; pausing stops future scheduled runs. Generation and settings changes do not publish to X.
