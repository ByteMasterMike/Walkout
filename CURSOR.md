# CURSOR.md — WalkOut

Operating manual for Cursor 3 on this repo. This file gets read by Cursor's agents on every task. The PRD under `docs/prd/` is the source of truth for what to build; this file is the source of truth for **how**.

This is the cofounder-side counterpart to `CLAUDE.md`. Both files coexist — they reference the same PRD modules and enforce the same rules. The differences are tooling (`.cursor/agents/` vs `.claude/agents/`) and a bit more guidance for AI-assisted work.

## Project (one-paragraph version)

WalkOut is a restaurant payment + operating system. A diner taps an NFC sticker on the table, the app opens a tab and puts a temporary $75 hold on their card, they order food through the app, eat, leave — the actual charge happens automatically when they go. Restaurants get a free POS (no monthly fee, no terminal hardware, no contract). WalkOut earns 0.5% from the diner. We're forking PokerPay (a poker-table app with similar mechanics) and rebuilding it for restaurants. Launch market: Warminster, PA.

## Stack — what these words mean if you're new

- **Next.js 16**: the web framework. Pages live under `src/app/`. API routes live under `src/app/api/`. Same codebase serves the website and the API.
- **Prisma**: the database library. The schema is in `prisma/schema.prisma`. When you change it, you run `npx prisma migrate dev` to update the database. Migrations live under `prisma/migrations/`.
- **Supabase**: hosted Postgres. Plus a real-time service that broadcasts database changes — we use it for the live table grid and KDS.
- **Stripe Connect**: the payments. WalkOut is the "platform"; each restaurant has a "connected account". Money flows directly from diner → restaurant, with WalkOut taking a cut on top.
- **`decimal.js`**: a money math library. Floating-point numbers (`0.1 + 0.2 = 0.30000000000000004`) lose pennies on big tabs. We use Decimal everywhere we touch money, then convert to integer cents only at the final Stripe call.
- **CloudPRNT**: a Star Micronics receipt-printer protocol. The printer polls our server for jobs; we don't push to it. Cash drawer opens via an ESC/POS command in the print job.
- **Resend / Twilio**: email and SMS. Resend for emails (receipts, staff invites). Twilio for urgent SMS (failed charges).
- **NextAuth v5**: handles login, signup, sessions. Three identity types: Restaurant ADMIN, RestaurantStaff (MANAGER or STAFF role), Diner. Plus anonymous guests via a cookie.
- **Vercel**: where this deploys. Has a "cron" feature that hits a URL on a schedule — we use it once, every 5 minutes, for cleanup tasks.

If a term in the PRD is unclear, ask the `code-explorer` agent — it's good at translating "what does this code actually do" into plain English.

## Seven Architectural Rules (PRD §7.2 — non-negotiable)

These will break production if violated. There are no exceptions.

1. **Prisma on Node.js only. Supabase JS client on Edge.** SSE routes (real-time streams) use `runtime = 'edge'`. Edge cannot run Prisma. If you find yourself importing `@/lib/prisma` into a file with `export const runtime = 'edge'`, stop — it's a wrong-shape error. Use `@/lib/supabase` there.
2. **One Vercel cron job.** Never add a second one. Add a function inside the existing `/api/cron/maintenance` route instead.
3. **Real-time fan-out goes through Supabase Realtime.** Do not use in-memory event emitters; multiple Vercel instances won't see each other's events.
4. **`OrderItem.unitPrice`, `OrderItem.taxRate`, `OrderItem.taxAmount` are snapshots set at order creation.** Never recompute them later. If the menu price changes mid-meal, in-flight orders keep their snapshotted price.
5. **Money never sits in WalkOut's Stripe account.** Stripe Connect routes payments directly to the restaurant's account. WalkOut takes `application_fee_amount` per transaction.
6. **Tax is on food subtotal only.** WalkOut's 0.5% service fee is on food subtotal only. Tip percentages are computed from food subtotal only. Service requests (water, silverware) don't enter any of these calculations.
7. **All money math uses `Decimal`, never `float`.** `new Decimal('10.50').times(0.06)` is correct. `10.50 * 0.06` is wrong. Convert to integer cents (`.times(100).toNumber()`) only when calling Stripe.

If you write code that violates one of these, the `code-reviewer` agent will block the PR. Don't fight it — it's catching a real bug.

## Payment Invariants (v5.2)

These are the tests every money-touching change has to pass. If you're working on UI only (the dashboard, the diner page), most of these don't affect you directly — they're enforced server-side. But you should still know they exist, because the API responses you display rely on them.

- **One charge per tab.** Tip is included in the single combined PaymentIntent. Old code from PokerPay or older WalkOut versions that does two charges is wrong.
- **20% default tip** if the diner doesn't pick one within 15 minutes of leaving. Has to be visibly disclosed on the tip selector.
- **"Table Cleared" never fires capture.** Staff clearing a table is a seating action, not a payment action.
- **Pro-rata fee allocation.** When Stripe takes a fee on the combined charge, the tip absorbs its proportional share. The numbers `feeAllocatedToFood`, `feeAllocatedToTip`, `feeAllocatedToTax`, `feeAllocatedToServiceFee` must sum exactly to Stripe's fee.

Full math in `docs/prd/02-payments-and-money.md`. Don't memorize it — when you need it, the agents will load it.

## Code Standards (the boring stuff that prevents bugs)

- **TypeScript strict mode**, no `any`. If TypeScript complains, fix the types — don't suppress.
- **Files 200–400 lines.** If a file is getting long, that's the signal to split it by feature.
- **No `console.log` in committed code.** It's fine while debugging, remove before pushing. Use the structured logger if you need persistent logging.
- **No emojis in source files** (in code, in comments, in commit messages). Emojis in UI strings shown to users are fine if the design calls for them.
- **No hardcoded secrets.** Stripe keys, database URLs, API keys all live in environment variables. If you ever paste a real key into a file, even by accident, treat it as compromised — rotate it.
- **Always generate console output** in throwaway scripts so we can see what they did.

## Working Together

You and Michael are both shipping to the same `main` branch. Day-to-day mechanics: see `WORKING-TOGETHER.md`. Branch and PR rules: see `BRANCHING.md`. Read both before your first PR.

Two rules worth pulling out here:

- **Schema migrations are serialized through Michael.** If you need a new column or a new model, ask in Slack — don't run `prisma migrate dev` yourself. The reason is that two divergent migration directories can't be merged cleanly, and Prisma will get confused. This is the single biggest cause of "we lost a day" for two-person teams.
- **One PRD module per branch.** A branch named `feat/menu-crud` should only touch files described in module 05. If you need to touch payment code AND dashboard UI in the same change, the `orchestrator` agent should split it into two branches with a handoff point. Don't try to do both at once.

## Cursor 3 Setup

Agents live in `.cursor/agents/`. They mirror the Claude Code agents in `.claude/agents/`. You don't need to set them up — they're already in the repo.

The agents you'll use most often:

- **`@orchestrator`** — start here for any feature that's bigger than a one-file change. It will break the work into subtasks and dispatch the right specialists. Particularly useful when the PRD spans multiple modules and you'd otherwise have to figure out which to load.
- **`@code-reviewer`** — run before every PR. It catches bugs, missing error handling, and convention violations. Don't merge until its verdict is APPROVE or WARNING (with reason). BLOCK means stop and fix.
- **`@security-reviewer`** — run on anything that touches payments, auth, tokens, webhooks, or RBAC. This is the agent that catches the "an attacker could manipulate this URL to charge a different card" class of bug. If you're working on UI only, you won't need it as often.
- **`@database-reviewer`** — only relevant when there's a migration. Michael owns migrations, so you'll rarely invoke this. If you do touch a query and it feels slow, this agent can suggest indexes.
- **`@build-error-resolver`** — when the build breaks, paste the failing command output and let it drive. It will fix the root cause without rewriting the architecture.
- **`@code-explorer`** — when you need to understand a part of the code you haven't touched. Returns a map without editing anything. Useful when picking up a half-written feature or trying to understand what PokerPay's session creation actually does.
- **`@tdd-guide`** — only for money code (`src/lib/payment/`, `src/lib/tax/`, `src/lib/tip/`). Writes the failing test first. If you're not working on those paths, you don't need it.

## How to Ask Cursor's Agents Well

Two patterns that produce good results:

**Pattern 1: Start with context, then the goal.**

> "I'm building the diner tab page (PRD module 05, §22). I need a Featured Items row at the top that shows menu items where `isPopular = true`. The data comes from `/api/restaurants/[restaurantId]/menu` which already exists. Use the existing menu item card component if there is one. Make it horizontally scrollable on mobile."

That's better than:

> "build a featured items row"

The first version tells the agent which PRD module to load, which API to call, which component to look for, and what the UI should do. The agent doesn't have to guess.

**Pattern 2: When you're not sure what's correct, ask `@code-explorer` first.**

If you start with "build X" and you're not sure what's already there, you'll get an answer that re-implements what already exists or conflicts with it. `@code-explorer` is read-only — it won't change anything. It will tell you what the relevant files do, what the current API looks like, and which PRD section governs the behavior. THEN you build.

## When You're Stuck

Three escalation levels, in order:

1. **Try a different agent.** If `@code-reviewer` is being unhelpful, maybe the question is for `@code-explorer`. Wrong agent for the task is the most common reason agents seem dumb.
2. **Read the relevant PRD module.** They're in `docs/prd/`. They're long but searchable. Most "I don't know what this should do" questions are answered there.
3. **Ask Michael.** Slack works. So does adding a `// TODO(michael): not sure how to handle X — see PR #N` comment in code, which is honest and traceable.

Don't ship code you don't understand because the AI produced it. If `@code-reviewer` flags something and you can't explain why the fix is correct, ask. Six months from now you'll be debugging this code, and "the AI wrote it" is not a debugging strategy.

## Working Style

Short paragraphs in chat. Push back if an agent (or Michael) is wrong — silent compliance is worse than a 30-second disagreement. If you're not sure whether you're right, say "I think X but I'm not certain — can you explain?" That's a fine question and gets you a better answer than pretending to agree.

Don't ship the first thing the AI produces. Read it. Check that it handles errors. Check that it doesn't have a `// TODO` you missed. Run it locally if it's runnable. The AI is a fast, knowledgeable junior engineer who occasionally hallucinates. Treat its output that way.

## When in Doubt

PRD wins over this file. If the PRD is silent, ask Michael. If the PRD contradicts itself, surface it — that's a real bug, and resolving it is more valuable than guessing.
