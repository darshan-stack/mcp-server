# PostQueue — Implementation and Design Plan

## Product behavior

PostQueue is a private, mobile-first approval inbox for original X post drafts. A scheduled job runs every 15 minutes and may create at most one draft when no other draft is awaiting review. Each draft stays unpublished until Darshan explicitly approves it. He can edit, approve, or reject drafts from a phone or desktop. Publishing uses the official X API only after X OAuth is configured. The app must never auto-publish, scrape or hijack trending topics, or copy posts from the reference creator. A pause switch stops future draft generation and publishing.

The reference account informs broad voice traits only: personal developer/open-source progress, practical lessons and questions, and relaxed humor. Drafts are original and must stay within the user's eventual account topic guidance. A source or claim that cannot be verified should be phrased as personal opinion or omitted. A pending-draft guard prevents 15-minute scheduling from flooding the approval queue.

## Implementation approach

Use the initialized Manus-managed Web project: React, TypeScript, Express/tRPC, Drizzle, and the managed MySQL database. Manus OAuth protects the owner-only dashboard. A durable `posts` record tracks draft text, category, status, generation time, review time, approval time, X post ID, and errors. A settings record stores the configured topic/tone, paused state, interval, and schedule identity. Mutations validate owner identity and legal status transitions; approval calls an idempotent publisher so refreshes or repeated callback attempts cannot create duplicate posts.

A scheduled HTTP callback generates drafts with the built-in Manus LLM, applies length, topic and similarity checks, and stores a draft for review. It checks for a pending item first and skips the generation cycle when one exists. The schedule uses UTC every 15 minutes and is registered only after a published version contains the callback. While X credentials are missing, an approved item is visibly blocked from publishing and remains queued; approval itself must not be treated as evidence that it was posted. X credentials are added through protected project secret setup, never committed in source.

The first mobile approval surface is the secure, responsive web app with large, explicit Approve / Edit / Reject actions and a queue badge. Mobile push delivery is not assumed: if phone push is needed beyond opening the dashboard, add an opt-in installable PWA and Web Push configuration as a later setup step after the required browser subscription/VAPID configuration is agreed. The app will clearly explain notification status rather than claim a notification was delivered.

## Project structure

- `client/src/pages/Home.tsx`: mobile-first approval inbox, post composer/edit screen, recent history, pause control, and clear integration status.
- `client/src/index.css` and `client/index.html`: visual tokens, responsive behavior, and product metadata.
- `server/routers.ts`: authenticated queue, review, settings, and integration-status procedures.
- `server/db.ts` and `drizzle/schema.ts`: persistent draft/settings queries and tables.
- `server/_core/`: scheduled callback, X API client, LLM draft generation and validation modules.
- `drizzle/`: additive migration for app data.
- `public/manus-routes.json`: synchronized website route declaration.

## Design

**Design Movement:** Calm editorial operations console, influenced by independent developer journals and compact review tools; no imitation of the reference creator's visuals or voice.

**Core Principles:** Review first; every publishing action is explicit. Show one clear next action on mobile. Keep status, risk and connection state visible. Draft content remains the focus, not analytics or growth hacks.

**Color Philosophy:** Warm paper and charcoal make the queue feel like a personal notebook; cobalt marks actionable states and success; amber signals review or configuration, and muted red is reserved for destructive rejection or failures.

**Layout Paradigm:** A narrow, reading-first mobile column with a persistent bottom action bar on the current draft; a wider desktop split view pairs the queue rail with the selected draft.

**Signature Elements:** A restrained blue status rail for each queued item; compact source/category labels; a live character count beside the draft text.

**Interaction Philosophy:** Approval is deliberate and visible. Editing is nondestructive. Reject requires no extra ceremony but can be undone from history when feasible. Disabled publishing controls explain the missing setup.

**Animation:** Subtle 140–180 ms transitions for queue selection and state changes; no looping motion, confetti, or distracting counters. Respect reduced-motion preferences.

**Typography System:** System sans for interface and compact labels, paired with a readable editorial serif for post previews; monospaced numerals for character counts and timestamps.

**Brand Essence:** A private review inbox that lets a developer stay human while automating the boring parts. Personality: candid, careful, quietly playful.

**Brand Voice:** Direct and unpolished in a friendly way. Examples: “One draft. Your call.” and “Approved means ready to send—not already sent.”

**Wordmark & Logo:** A compact PostQueue wordmark with a small stacked-card glyph and a blue approval check; create with CSS/SVG, no external image dependency.

**Signature Brand Color:** Clear cobalt blue for the approval action and queue status.

## Selected style directions

- Editorial developer journal: 0.07 probability.
- Quiet operations console: 0.04 probability.
- Playful creator inbox: 0.03 probability.

Chosen direction: quiet editorial operations console with a lightly personal developer-journal voice, using the account profile only as broad content guidance.
