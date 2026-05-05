# WORKING-TOGETHER.md — How We Build in Parallel

This is the playbook for two-person concurrent development on WalkOut. Read it once before your first day of parallel work. Re-read the section relevant to your current phase before each phase starts.

## Roles

**Michael (technical co-founder, Claude Code)** — Track A. Owns server-side: Prisma schema, migrations, API routes, payment logic, webhooks, cron, auth/RBAC, infrastructure. Schema authority — only Michael writes migrations.

**Cofounder (business/ops, Cursor 3 with AI assist)** — Track B. Owns client-side: dashboard UI, diner PWA pages, KDS UI, floor setup UI, menu admin UI, notifications display. Consumes the APIs Michael builds.

The split isn't ironclad — Michael will sometimes build UI when it's faster (e.g. internal admin tools), cofounder will sometimes touch server code (e.g. a small API tweak that's blocking their UI). The default split exists so each person has a clear "this is mine" zone where they can move fast without coordination.

## Working Hours

- Both work during the day; mostly overlapping. Michael may go later into the evening.
- During overlap: real-time Slack, fast feedback, ad-hoc pairing on tricky bits.
- During Michael-only evening hours: Michael picks up anything blocked on schema or server work the cofounder couldn't progress past, leaves clean handoffs in PR comments for the morning.

This shapes the day-to-day rhythm: blockers get resolved during overlap, infrastructure work happens in the evening, cofounder picks up unblocked work first thing in the morning.

## The Parallel Split, Phase by Phase

### Phase 1 (Weeks 1–2): Foundation + RBAC

**Build together, not split.** Phase 1 is small enough that splitting costs more than it saves. Both work on the same branch in pairs or hand off through small PRs. Goal is to ship Phase 1 in the first week so Phase 2's split has a stable foundation.

The shared work, in rough order:
1. Fork PokerPay, strip poker references (1 day, both).
2. Update `prisma/schema.prisma` to v5.2 — full schema from `01-architecture-schema.md`. Michael leads, cofounder reviews. (1 day)
3. First migration. Michael runs it on local Postgres, then on Supabase staging. (½ day)
4. Update `package.json` — remove zxing, add stripe + decimal.js + web-push. (½ day, either)
5. Update `next.config.ts` CSP. (½ day, either)
6. NextAuth setup with Restaurant ADMIN registration + login. Michael. (1 day)
7. RBAC middleware. Michael. (½ day)
8. Staff invite flow with Resend. Cofounder builds the UI, Michael builds the API + email template. (1 day)
9. `/api/join/[nfcTagId]` route. Michael. (½ day)
10. `/join/[nfcTagId]` page with name entry, dietary notes, consent copy. Cofounder. (1 day)
11. Anonymous session cookie middleware. Michael. (½ day)
12. `/dashboard/setup` page (table CRUD, NFC URL display). Cofounder. (1 day)
13. Cron skeleton with stub functions. Michael. (½ day)
14. Tests for race-safe session creation. Both. (½ day)

End of Phase 1: NFC tap → join → open tab works. Full RBAC working. Race condition handled.

### Phase 2 (Weeks 3–4): Menu + Ordering + KDS + Floor + Service Requests

**This is where parallelism starts paying off.** Hard split:

#### Track A — Michael

- `MenuItem` + `MenuCategory` CRUD API (ADMIN + MANAGER roles)
- Tax snapshot at order creation (`taxRate`, `taxAmount` on `OrderItem`)
- `/api/sessions/[sessionId]/orders` route with full snapshot logic
- SSE infrastructure: `/api/sessions/[sessionId]/stream` and `/api/restaurant/stream` (Edge runtime, Supabase Realtime)
- `TableAssignment` model + CRUD API
- `assignServerToSession()` business logic (called at session creation)
- Service request acknowledge / resolve API endpoints
- Public menu read endpoint with search param

#### Track B — Cofounder

- `/dashboard/menu` page (category/item management UI, photo upload to R2, allergen tagging)
- `/tab/[sessionId]` page (the diner's main experience — see PRD §22):
  - "How It Works" first-visit banner
  - Featured Items row
  - Category filter pills, item grid
  - Search input in nav bar
  - Item detail modal with kitchen notes field
  - My Tab section with running total
  - Service Requests button row
- Client `useSessionStream` and `useRestaurantStream` hooks (with mobile reconnect logic from §10.4)
- `/dashboard/tables` live table grid
- `/dashboard/tables/[tableId]` live tab detail
- `/dashboard/kitchen` KDS full-screen tile grid (filters service request events client-side)
- `/dashboard/requests` service request queue with audible chime
- `/dashboard/floor` server assignment UI (drag tables to staff)

#### Handoff Points

The two tracks meet at the API contract. Process:

1. Michael ships the **Zod input/output schemas** for each new API route as the first thing — even before the implementation. These go in `src/lib/schemas/` and are imported by both server and client.
2. Cofounder builds the UI against the Zod types. TypeScript will tell them if their fetch shape is wrong before runtime.
3. Michael ships the implementation. Cofounder runs the UI against the live API.

If Michael needs to change a schema mid-flight (almost always avoidable, but it happens): 10-minute pairing session, change the Zod schema, both update their code, push. Don't change a schema async — the cofounder's UI breaks silently if the API contract drifts.

### Phase 3 (Weeks 5–7): Payments — Hold & Capture

**Heavy split toward Michael.** Payment code is high-stakes and benefits from the technical co-founder owning it end-to-end. Cofounder focuses on payment-related UI and supports with Phase 4 setup.

#### Track A — Michael

Almost all of PRD module 02 implementation: SetupIntent creation, hold creation, `captureParticipantTab()` (full math), webhook handlers (with `req.text()` first), tip attribution in webhooks, `feeAllocatedTo*` writes, departure detection (the two state machines, §11.6), hold re-authorization, `processDepartures()` and `cleanupSessions()` cron functions, host-leaves-before-group flow, `/api/sessions/[sessionId]/checkout`, `/api/restaurant/sessions/[id]/clear`, `/tab/[sessionId]/pay` (guest manual pay backend), Pending Settlements API.

#### Track B — Cofounder

- Stripe Connect onboarding UI (Stripe-hosted; cofounder wires up the redirect from `/dashboard/setup/stripe`)
- Apple Pay domain verification file in `public/.well-known/`
- Hold-failed UI ("Card declined") — block menu access component
- Idle warning toast (10-min threshold)
- Client heartbeat hook (30-second ping)
- `/dashboard/settlements` Pending Settlements UI (consumes the API Michael builds)
- Payment-status badges in `/dashboard/tables/[tableId]` (failed hold indicator, failed capture indicator)
- Start Phase 4 prep: skim CloudPRNT spec, order the mC-Print3 hardware

#### Handoff Points

- Stripe Connect: cofounder sets up the redirect, Michael builds the API. Both verify the round-trip works.
- Pending Settlements UI consumes a Michael-built API; the Zod schema for the response goes into `src/lib/schemas/settlements.ts` first.
- Cofounder runs the integration test from end-to-end (NFC tap → order → leave → tip → capture) using their own Stripe test card. This is real value-add — a fresh user testing the flow catches UX bugs Michael will miss because he wrote it.

### Phase 4 (Week 8): Cash + Printing + Tip Distribution

Mostly together. CloudPRNT integration requires the physical printer (cofounder owns hardware logistics anyway), so they pair on it.

- Michael: PrintJob model, generateCashReceiptXml(), polling endpoint, tip pool API.
- Cofounder: `/dashboard/setup/printer` UI, KDS CASH_PENDING tile variant styling, cash payment alert banner, tip pool UI (DIRECT mode per-server view, POOL mode close/distribute flow), legal disclaimer modal copy.

### Phase 5 (Week 9): Tips + Accounts + Notifications

Heavy split.

#### Track A — Michael

- Tip token signing/verification (HMAC-SHA256, 24h expiry, maxTipCents cap)
- Diner registration + login (separate NextAuth provider)
- `/api/diner/payment-method/setup` + confirm
- Push subscription save endpoint
- Guest → account migration transaction
- AWAITING_TIP cron logic
- All the Resend email template wiring (Michael writes the trigger code)

#### Track B — Cofounder

- `/tip/[tipToken]` one-tap tip selector page (with 20%-default countdown disclosure)
- `/account` page (card management, tip preference, dietary notes)
- `/account/history` page
- Resend email template HTML/MJML (cofounder writes the templates, Michael wires them in)
- Twilio SMS template copy
- Quarterly tax report CSV download UI
- Tip report CSV download UI (gross/fee/net columns)
- Service request analytics page

### Phase 6 (Week 10): PWA + Hardening + First Restaurant

Together. This is launch week. Both pair on every step. Cofounder leads the first-restaurant onboarding (their relationship); Michael leads the production deploy and security audit.

## A Day in the Life

### A typical Tuesday during Phase 2

**Both online ~9am:**
- Stand-up Slack message: "I'm picking up X today" / "I'll be on Y."
- 5-minute sync if there's anything to coordinate (e.g. "I need a column on `MenuItem` for sort order — can you add that?").

**9:30am – 12:00pm:**
- Michael working on the orders API. Cofounder working on the menu CRUD UI.
- Cofounder hits a question: "What does the API response shape look like?" Slacks Michael, gets the Zod schema link, unblocked in 2 minutes.

**12:00pm – 1:00pm:**
- Lunch / break.

**1:00pm – 3:00pm:**
- Michael ships the orders API to a branch. Runs `@code-reviewer` and `@security-reviewer`. Both verdicts pass. Merges.
- Cofounder rebases their UI branch on the new `main`. Their `useSessionStream` hook now hits the live API. Catches a small mismatch — Michael's response uses `unitPrice` not `price`. They fix the UI, push.

**3:00pm – 5:00pm:**
- Cofounder runs `@code-reviewer` on their UI branch. Verdict: WARNING — they used `console.log` in two places. They remove them. Merge.
- Michael starts on tax snapshot logic.

**5:00pm – 6:30pm:**
- Cofounder wraps up, leaves notes in Slack about where they ended.

**6:30pm – 9:00pm (Michael only):**
- Michael ships tax snapshot. Picks up a small piece of UI cleanup the cofounder couldn't get to (e.g. the empty-state card in the menu page). Drafts a PR description for the cofounder to review in the morning.
- Pushes a Phase 2 progress update to a `STATUS.md` file or Slack.

### When You're Blocked

In order of escalation:

1. **Try `@code-explorer`** to understand the existing code first. Most "blocked" feelings are actually "I don't know where this lives in the codebase."
2. **Ask the relevant agent.** `@code-reviewer` if you're stuck on whether your code is right. `@build-error-resolver` if the build is broken. `@security-reviewer` if you're not sure whether your auth check is sufficient.
3. **Slack the other person.** "Stuck on X — can you take a look?" with a link to the branch is enough. During overlap hours, response is fast. Outside overlap, leave the Slack and switch to something else — don't sit waiting.
4. **Park it.** If the blocker is genuine and you can't progress, push what you have, mark the branch `[BLOCKED on Michael for X]`, and pick up another task. Don't let one blocker freeze your whole day.

## Communication Conventions

- **Slack channels**: `#walkout-build` for code/design questions, `#walkout-ops` for restaurant outreach and operational stuff. Don't mix them.
- **GitHub for code review.** Don't review code in Slack. Comments on the PR are searchable and traceable; Slack messages aren't.
- **`@here` is for genuine blockers only.** "I'm about to push a schema migration in 5 min" is `@here`-worthy. "What do you think of this color?" is not.
- **End-of-day handoff in `#walkout-build`**: where you ended, what's blocked, what you're picking up tomorrow. Three lines max.

## Status Tracking

We use GitHub issues, not a separate project tool. One issue per work item from the phase plan. Labels:
- `module-00` through `module-07` (which PRD module it touches)
- `track-a` or `track-b` (who owns it)
- `phase-1` through `phase-6` (which phase)
- `blocked` (waiting on something)

Open the issue when you start. Reference it in your commits (`Closes #42`). Close it when the PR merges. Don't pre-create all of Phase 6's issues during Phase 2 — only the next 1–2 weeks of work, max.

## What to Do at the Start of Each Phase

1. **Both read the relevant PRD modules.** Phase 2 means re-reading 04 and 05. Phase 3 means deep-reading 02. Don't skip — the agents will load the modules for their tasks, but you also need them in your head to ask good questions.
2. **Sync on the split.** Do the assigned tracks in this doc still make sense, given what you learned in the previous phase? Adjust if needed.
3. **Open the GitHub issues for the next 1–2 weeks of work.** Tag with phase + module + track.
4. **Do a 30-minute joint planning session.** Walk through the work items. Identify handoff points and likely blockers. Decide on any deviations from the playbook.
5. **Start.**

## What Goes Wrong (and How to Recover)

### Schema migration conflict

**Symptom**: Michael pushed a migration; cofounder's branch has different `prisma/schema.prisma` content.

**Recovery**: Cofounder checks out `main`, runs `git pull`. On their feature branch: `git rebase main`. The schema file should resolve cleanly because cofounder hadn't been editing it. The migrations directory needs the cofounder's `npx prisma migrate dev` reset — but since they didn't run any migrations themselves (Rule 3), there's nothing to reset. They just rebase and continue.

If the cofounder DID run `prisma migrate dev` against Rule 3: ping Michael. Michael resolves manually. Lesson learned: don't break Rule 3.

### API contract changed mid-flight

**Symptom**: Michael changed a route response shape after cofounder built UI against the old shape. Cofounder's UI breaks at runtime.

**Recovery**: Find the `src/lib/schemas/*.ts` Zod schema for the route. Update it. TypeScript will surface every place that needs to change in the UI. Fix them in a small follow-up PR.

**Prevention**: When changing an API contract, search the codebase for the route path or the schema name BEFORE merging. If anything client-side imports it, ping the cofounder before merging.

### Stripe webhook stops firing locally

**Symptom**: Cofounder is testing the capture flow locally; nothing happens after departure.

**Recovery**: Make sure `stripe listen --forward-to localhost:3000/api/webhooks/stripe` is running in a terminal. The forwarded webhook secret is different per session — make sure `.env.local` has the latest `STRIPE_WEBHOOK_SECRET` from the `stripe listen` output.

### "It works on my machine"

**Symptom**: Cofounder's UI looks right locally; Michael says it's broken.

**Recovery**: Compare environments. Check Node version (`.nvmrc`), package versions (`npm install` from a clean state), `.env.local` contents (without leaking secrets — diff variable NAMES). Most "works on my machine" is a missing env var or a stale `node_modules`.

### Lost a day to the AI

**Symptom**: Cofounder followed the AI's lead on a feature, ran into a wall at the end of the day, doesn't have a clear path forward.

**Recovery**: Stop. Take a break. The next morning, run `@code-explorer` on the relevant subsystem to get a clean map. Then plan the feature again from scratch — don't try to salvage the AI's previous work if it took a wrong turn. Salvaging usually costs more time than starting over.

**Prevention**: Don't let the AI build features end-to-end without checkpoints. Every 30–60 minutes, read what it produced. If you can't explain what it did, that's the warning sign.

## What This Doc Doesn't Cover

- Marketing, sales, restaurant outreach. That's `#walkout-ops` territory.
- Specific PRD content. That lives in `docs/prd/`.
- Per-agent behavior. That lives in `.claude/agents/` and `.cursor/agents/`.
- Personnel decisions. If the working dynamic isn't working, talk in person, not via this doc.

## When to Update This Doc

After every phase, do a short retro (15 minutes max): what worked, what didn't, what to change. Update this doc with the lessons. The first version is going to be wrong in places — it's been tested for a total of zero days. The version after Phase 1 will be better.
