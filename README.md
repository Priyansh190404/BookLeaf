# BookLeaf Author Support & Communication Portal

Two portals on one Next.js app: **authors** raise and track support tickets; the **ops team** triages them with AI-assisted classification, priority scoring and drafted replies.

**Stack:** Next.js 15 (App Router, route handlers as the REST API) · TypeScript · Node 20 · PostgreSQL · Google Gemini (free tier) · zod · jose (JWT) · bcryptjs

> Confidential assignment material. Keep this repository private.

## Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bookleaf.in` | `Admin@123` |
| Admin | `support@bookleaf.in` | `Admin@123` |
| Author (all 10 from the dataset) | e.g. `priya.sharma@email.com` | `Author@123` |

Handy edge cases: `ananya.reddy@email.com` (published, **never paid**), `sneha.kulkarni@email.com` (one book **in production**), `kavita.deshmukh@email.com` (book in production + pending royalty **below the ₹1,000 threshold**), `arjun.malhotra@email.com` (zero payouts). Login page has click-to-fill shortcuts.

## Run locally

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, JWT_SECRET, GEMINI_API_KEY
npm run db:setup              # applies db/schema.sql + seeds 10 authors / 18 books / 2 admins (idempotent)
npm run dev                   # http://localhost:3000
```

Other scripts: `npm test` (unit tests, no DB needed) · `npm run test:e2e` (API smoke test; needs a running server and seeded DB: `BASE=http://localhost:3000 npm run test:e2e`) · `npm run typecheck` · `npm run build`.

Without `GEMINI_API_KEY` the app runs in **manual mode**: everything works, tickets get keyword-based triage, and the admin writes replies by hand (see *Graceful degradation*).

### Deploying
Any Node host + managed Postgres works (Render/Railway/Vercel + Neon). Set `DATABASE_URL`, `PGSSL=true` (if the provider needs TLS), `JWT_SECRET`, `GEMINI_API_KEY`, then run `npm run db:setup` once against the production DB. Deploy URL: _add here_.

## Architecture

```
src/
  middleware.ts            edge auth gate: every /api route + role-gated pages
  app/api/**/route.ts      thin REST handlers: parse -> service -> respond
  app/{author,admin,login} React UI (client components, polling for live updates)
  lib/
    http/route.ts          route() wrapper: auth, RBAC, uniform error shape, zod/pg error mapping
    auth/                  JWT session (httpOnly cookie or Bearer), password hashing
    services/ticketService business rules + AI orchestration (the only place that does both)
    repositories/          SQL only. No business logic
    ai/                    client (timeouts, breaker), prompts, triage, draft, KB, payout math, context
    validation.ts          zod schemas = single source of truth for enums & input rules
db/schema.sql              schema    scripts/  migrate + seed    tests/  unit + e2e
```

**Key decisions**

- **One Next.js app, REST in route handlers.** One deployable, shared TypeScript types between API and UI, while still a clean REST surface (documented below). The service/repository split keeps handlers free of SQL and business rules, so the API could be lifted into a standalone Node service without rewriting logic.
- **Schema.** `authors`/`books` mirror the dataset (nullable `publication_date`/`mrp` for in-production books). `users` is the login identity (role `author` ↔ has `author_id`, enforced by a CHECK). **Conversation and internal notes live in one `ticket_messages` table** with `is_internal`, so thread ordering is trivial and author-visibility is one `WHERE` clause. Triage fields carry a `*_source` (`ai | fallback | admin | pending`) so the UI can show provenance and so AI never overwrites an admin's override.
- **Auth/RBAC in three layers:** edge middleware (401 for any unauthenticated API call; role-gated pages) → `route({ roles })` (403) → service-level ownership checks. Author isolation is enforced in SQL (`author_id = session`), and other authors' tickets return **404, not 403**, so IDs can't be probed. JWT in an httpOnly, SameSite=Lax cookie; `Authorization: Bearer` also accepted for Postman/scripts.
- **Real-time = polling** (5s author, 5s admin detail, 8s queue; pauses on hidden tabs, re-renders only when the payload changed). Chosen over WebSockets/SSE because it works on any serverless/proxy setup with zero infra; the cost is up to ~5s latency, which fits "feels responsive". Upgrade path: SSE from the same endpoints.
- **Attachments** are stored in Postgres (`ticket_attachments.data bytea`) so uploads work on any host, including serverless with no persistent disk. Security: the file type is detected from **magic bytes** (the client's MIME type and extension are ignored), filenames are sanitised, size/count are capped, downloads follow the ticket's access rule (others get 404), and are served with `nosniff` + a sandbox CSP; only images render inline. Uploads are one request per file after the ticket is created, so a failed upload never loses the ticket (the author is told which files failed).
- **Queue scale:** server-side pagination (25/page, stable ordering) with a separate `/tickets/summary` query, so the headline counts cover the whole queue rather than just the visible page.
- **Notifications (in-app):** My Tickets toasts and marks a ticket with a dot when BookLeaf replies; the admin queue toasts when a new ticket arrives.
- **Ticket lifecycle rules** (in one SQL transaction): first public admin reply moves Open → In Progress; an author reply on a Resolved ticket reopens it; Closed tickets accept no author replies (409, "open a new ticket").
- **Queue urgency:** default sort = unresolved first → priority → *oldest first*. Rows turn red when open longer than a per-priority target (Critical 8h, High 24h, Medium 3d, Low 7d; `lib/sla.ts`).

## AI integration

**Model:** `gemini-3.6-flash` (configurable via `AI_MODEL`; `gemini-3.6-flash` has a more generous free quota). Both tasks are short, structured and run once per ticket, so a small fast model is enough, and the free tier means the whole project runs at zero cost. Gemini's schema-constrained JSON output gives reliable classification, and the drafts are human-reviewed, which is what makes a small model appropriate. The provider is isolated in `lib/ai/client.ts` (plain `fetch`, no SDK), so swapping to OpenAI/Anthropic is a one-file change.

### Triage (category + priority), at ticket creation
- One call with `responseMimeType: application/json` + an enum-constrained JSON schema → reliable JSON; the output is re-validated with zod anyway.
- Prompt = category definitions + a **priority rubric** (e.g. months of missing royalty = Critical; ISBN errors ≥ High per policy; bio change = Low) + a one-line book fact (e.g. *"published, never paid out"*). **No knowledge base is sent**, it isn't needed to classify (~400 input tokens, ≤150 output).
- Admin can override both; overrides are sticky (`saveTriage` never overwrites `*_source = 'admin'`). A "Re-run AI classification" button exists for tickets that were triaged while the AI was down.

### Drafted reply, when the admin opens a ticket
- **System prompt (stable):** persona, tone guidelines, hard rules (ground every claim in the supplied policy/facts, never invent numbers/dates, own BookLeaf's mistakes, give a timeline when escalating, end with a next step, ≤180 words, sign-off).
- **User prompt (per ticket):** *only* the KB section for the ticket's category + one few-shot example from the brief + a **FACTS block** about the one referenced book + the author's message + last ≤6 public messages. Internal notes are never sent.
- **Facts are computed in code, not by the model:** next payout date (quarter end + 45 days), days since last payout, "never paid", "below ₹1,000 so it rolls over", "not yet published, so no royalties or listings". LLMs are unreliable at date math and must not invent payout dates.
- Examples of edge cases handled by the facts block: Kavita's ₹850 pending → rollover explanation; "Midnight in Mysore" (Cover Design) → production-stage answer, no royalty talk.
- The draft is cached on the ticket (`ai_draft`), so re-opening is free; it's regenerated only on request or after a new author reply (staleness = public thread length changed). Sends are tagged `ai_assisted` so you can later measure draft usefulness.

### Cost management
| Lever | Detail |
|---|---|
| Right-sized context | Per-category KB section, not the whole KB; one book's facts, not the account history; thread capped at 6 messages × 800 chars; description capped at 2,000 chars |
| No KB in triage | Classification needs ~400 tokens |
| Generate once, cache | Draft stored in DB; admin opens ≠ new API call |
| Capped outputs | 150 tokens (triage), 500 (draft) |
| Thinking off | Gemini 2.5 "thinking" tokens are disabled (`thinkingBudget: 0`): cheaper, faster, and they can't eat the small output budget |
| Visibility | Every call logs model + input/output/cache tokens (`[ai:triage] in=… out=…`), handy for watching free-tier quota |

Rough cost per ticket ≈ 1 triage call + ~1 draft call ≈ 2.5k input / 0.6k output tokens total.

### Graceful degradation
Failure modes: no key, 429 (easy to hit on the free tier), timeout, 5xx, malformed/blocked output. All map to one `AiUnavailableError`, and:
- **Ticket creation never depends on AI.** The ticket is inserted first; triage is best-effort. If AI fails, a deterministic keyword classifier assigns category/priority, labelled `auto*` in the queue ("please review").
- **Drafting:** `POST /api/tickets/:id/ai/draft` returns **200 `{aiAvailable:false, reason}`** (not a 5xx). The UI shows a banner and an empty editor, so the admin writes manually; send/status/notes are unaffected.
- **Circuit breaker:** after 3 consecutive failures the AI is skipped for 60s, so an outage doesn't add a timeout to every ticket. SDK retries are limited to 1 and the per-call timeout is `AI_TIMEOUT_MS` (15s).
- Verified by test: with no key and with a mocked 429 (`GEMINI_BASE_URL` can point the client at a mock server), all ticket flows still pass.

### API key security
`GEMINI_API_KEY` is read only in `lib/env.ts` on the server and sent in an `x-goog-api-key` header (never in a URL, so it can't leak into logs); nothing is `NEXT_PUBLIC_`, the browser never talks to the model, and `.env` is gitignored.

## API reference

Base path `/api`. Success: `{ "data": … }`. Error: `{ "error": { "code", "message", "details?" } }` with real status codes (400 validation / 401 unauthenticated / 403 forbidden / 404 / 409 / 500 generic). OpenAPI spec: [`docs/openapi.yaml`](docs/openapi.yaml) (import into Swagger UI or Postman).

| Method & path | Who | Purpose |
|---|---|---|
| `POST /auth/login` | public | email + password → sets httpOnly session cookie (also returns session) |
| `POST /auth/logout` | any | clears cookie |
| `GET /auth/me` | any | current session |
| `GET /health` | public | liveness |
| `GET /books` | author (own) · admin (`?authorId=` required) | books with royalty fields |
| `GET /tickets` | author (own only) · admin (all) | list. Query: `status, category, priority, assigned=me\|unassigned, from, to, q, sort=urgency\|newest\|oldest, limit, include=messages`. Author responses omit triage metadata |
| `POST /tickets` | author | create `{bookId?, subject, description}`; `bookId` omitted = General / Account Level. Triggers AI triage; returns 201 |
| `GET /tickets/:id` | owner author · admin | detail + thread. Internal notes only for admins |
| `PATCH /tickets/:id` | admin | `{status?, category?, priority?, assignedTo?: "me"\|null}`; category/priority edits are recorded as admin overrides |
| `POST /tickets/:id/attachments` | owner author | upload one file (`multipart/form-data`, field `file`). PNG/JPEG/GIF/WebP/PDF, ≤5 MB, ≤5 per ticket. 413 too large · 415 wrong type · 409 limit/closed |
| `GET /tickets/:id/attachments/:attId` | owner author · admin | download/preview (images inline, PDFs as download) |
| `POST /tickets/:id/messages` | owner author · admin | public reply `{body, aiAssisted?}` (lifecycle rules above) |
| `POST /tickets/:id/notes` | admin | internal note `{body}` |
| `POST /tickets/:id/ai/draft` | admin | get cached / generate AI draft `{regenerate?}` → `{draft, aiAvailable, reason?, stale}` |
| `POST /tickets/:id/ai/triage` | admin | re-run classification + priority |

Validation limits: subject 5–150 chars, description 20–5,000, message ≤5,000, ≤5 files of ≤5 MB per ticket.

**Login rate limiting:** 5 failed attempts per IP+email in 15 minutes → `429 TOO_MANY_ATTEMPTS`; a successful login resets the counter.

## Assumptions, known limitations, and what I'd do next

- **Royalty quarters follow the Indian financial year** (Q1 Apr–Jun … Q4 Jan–Mar; confirmed by the product owner, since the brief says only "quarterly"). Quarter ends are Jun 30 / Sep 30 / Dec 31 / Mar 31 and payout is due 45 days later; the AI is given the FY label (e.g. "Q2 FY2026-27") and date from `ai/payouts.ts`. "Today" is the real clock, so against this static dataset (payout dates in 2025) the next-payout facts reflect *today's* cycle.
- **Overdue-royalty judgement is left to the admin.** Facts surface "never paid / days since last payout"; the draft is told to own genuine delays, but a human confirms before sending. I deliberately didn't auto-assert "overdue".
- **Attachments live in Postgres** (fine for a few MB per ticket; at volume move bytes to S3/R2 with signed URLs, keeping the table as the index) and have no virus scanning. Next: image-aware drafts for print-quality tickets.
- **Not done:** the login rate limiter is in-memory (per instance; use Redis/Postgres when running several instances), CSRF tokens (mitigated by SameSite=Lax + JSON-only APIs), password reset, email notifications to authors on reply, pagination beyond `limit=100`, admin management UI for users.
- **Polling → SSE/Postgres LISTEN-NOTIFY** for push, and a background job queue for AI work (so triage never sits in the request path at high volume; currently inline with a 15s cap).
- **AI quality loop:** log admin edit-distance between draft and sent text (`ai_assisted` is already stored) and AI-vs-admin classification overrides; build an eval set from those, tune prompts/threshold. Add retrieval (embeddings) once the KB outgrows per-category sections.
- Draft generation isn't locked: two admins opening the same fresh ticket at once can both trigger a call (harmless; last write wins).
