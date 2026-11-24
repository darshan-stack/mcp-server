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
- `postqueue_check_x_connection` — verify the configured X OAuth 2.0 user token and show the authorized account, without exposing the token.
- `postqueue_search_x_posts` — search recent public X posts using the configured X token; read-only.

X lookup tools use the X API v2 over HTTPS and the `X_USER_ACCESS_TOKEN` environment variable. The token must be an active OAuth 2.0 user access token with the necessary read scopes. X may also restrict recent search by API plan. `postqueue_check_x_connection` makes a read-only `/2/users/me` request to verify the credential; the dashboard's existing `xConnected` indicator only means a token value is configured, not that X accepted it.

The references [EnesCinr/twitter-mcp](https://github.com/EnesCinr/twitter-mcp) and [rafaljanicki/x-twitter-mcp-server](https://github.com/rafaljanicki/x-twitter-mcp-server) offer broader X features, including direct post/delete actions. PostQueue adopts only the read-only account-check and recent-search capabilities; their separate server implementations and write actions are not imported. There is deliberately no MCP tool for publishing, liking, following, bookmarking, or deleting. Publishing remains a separate manual approval action in the PostQueue dashboard.

## Configure access

Use a separate secret for MCP access. Do not reuse the website password or X token. Generate a strong key locally, for example:

```sh
openssl rand -hex 32
```

In Vercel, open the `mcp-server` project’s **Settings → Environment Variables**, add `MCP_ACCESS_TOKEN` with that value for **Production**, and redeploy the project. The value must be at least 32 characters. Do not paste it into GitHub, this documentation, or a chat. The MCP endpoint returns `503` until this variable is configured and `401` for an invalid bearer token.

To enable the read-only X tools, configure `X_USER_ACCESS_TOKEN` separately in Vercel Production. It must be an OAuth 2.0 **user** access token; it is not the MCP bearer secret and should not be shared. The X verification tool will report whether this token is accepted for the current-user read. Never add X credentials to the MCP client config.

Configure your MCP client with the endpoint above and send the generated value as an HTTP bearer token:

```http
Authorization: Bearer <your MCP_ACCESS_TOKEN>
```

Client-specific setup varies. This endpoint uses Streamable HTTP (not stdio), so use the remote HTTP MCP connection option in the chosen client.

## Safety and scheduling behavior

The schedule creates at most one draft per run when the queue is clear. If a draft is waiting for review, the next run skips generation. The schedule never publishes. Enabling the schedule starts 15-minute draft generation; pausing stops future scheduled runs. Generation and settings changes do not publish to X.
