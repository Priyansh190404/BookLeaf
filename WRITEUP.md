# Write-up: BookLeaf Author Support Portal

**What I prioritised.** The brief weights AI integration and architecture highest (50% together), so I built the core ticket loop first, with the AI hooks designed in, and polished the UI last. Author portal → ticket → AI triage → admin queue → AI-drafted reply → author sees it live, end to end, with real role-based isolation.

**AI approach.** Two deliberately different calls. *Triage* is a tiny schema-constrained JSON call (no knowledge base) returning category, priority and a one-line rationale. *Drafting* sends only the KB section for that ticket's category, one few-shot example, and a facts block about the one referenced book. The facts (next payout date, "never paid", "below the ₹1,000 threshold", "book still in Cover Design") are computed in code, because models shouldn't do date arithmetic or invent payout dates. Drafts are cached per ticket, never auto-sent, and never see internal notes.

**Trade-offs.**
- *AI never blocks the ticket.* The ticket is saved before any model call; failures fall back to keyword triage (flagged "auto*" for review) and a manual-reply mode, behind a circuit breaker. Cost: fallback classification is cruder, and triage runs inline (≤15s) rather than in a queue.
- *Polling over WebSockets.* Zero infrastructure and serverless-safe; costs up to ~5s latency.
- *One Next.js app* instead of separate API and frontend services: faster to ship and share types, with a service/repository split so the API can be extracted later.
- *Human in the loop over automation.* Even for "obvious" replies, an admin sends. Right call while draft quality is unmeasured.
- *Royalty quarters use the Indian financial year* (confirmed), computed in code and handed to the model as facts.

**Taking it to production.**
1. **Move AI to a job queue** (Postgres-backed or SQS) with retries, so triage is async and bursts of 1,200+ books/month of tickets don't couple to API latency.
2. **Close the quality loop:** track draft-vs-sent edit distance and AI-vs-admin overrides, build an eval set, then consider auto-send only for low-risk categories with high acceptance rates.
3. **Real knowledge retrieval** (embeddings over versioned policy docs) and live data tools (actual payout schedule, per-platform sales) once the KB outgrows sections; keep the computed-facts pattern.
4. **Operational hardening:** login rate limiting + MFA for admins, audit log, PII-aware logging, file uploads with virus scanning, SLA timers and escalation alerts, email/WhatsApp notifications to authors, push updates via SSE, and per-tenant AI spend dashboards using the token logs already emitted.
