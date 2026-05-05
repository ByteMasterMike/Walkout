# WalkOut — AI-Assisted Build Setup

A drop-in scaffold for building WalkOut as a two-person team using AI-assisted development. Includes project rules, agent definitions for both Claude Code and Cursor 3, the PRD v5.2 split into 8 focused modules, and a parallel-build playbook.

## Layout

```
.
├── CLAUDE.md                              ← Michael's manual (Claude Code)
├── CURSOR.md                              ← Cofounder's manual (Cursor 3)
├── BRANCHING.md                           ← Trunk-based git rules + PR workflow
├── WORKING-TOGETHER.md                    ← The two-person playbook (read this)
├── README.md                              ← You are here
│
├── .claude/
│   └── agents/                            ← 7 agents for Claude Code
│       ├── orchestrator.md
│       ├── code-reviewer.md
│       ├── security-reviewer.md
│       ├── database-reviewer.md
│       ├── build-error-resolver.md
│       ├── code-explorer.md
│       └── tdd-guide.md
│
├── .cursor/
│   └── agents/                            ← Same 7 agents, Cursor frontmatter
│       └── (mirrored)
│
└── docs/
    └── prd/                               ← PRD v5.2 split into 8 modules
        ├── 00-overview.md
        ├── 01-architecture-schema.md
        ├── 02-payments-and-money.md       ← The biggest one
        ├── 03-auth-staff-rbac.md
        ├── 04-kitchen-cash-ops.md
        ├── 05-dashboards-ui.md
        ├── 06-security-risks-decisions.md
        └── 07-build-plan.md
```

## Install

From your forked WalkOut repo root:

```bash
unzip walkout-setup.zip
cp walkout/CLAUDE.md .
cp walkout/CURSOR.md .
cp walkout/BRANCHING.md .
cp walkout/WORKING-TOGETHER.md .
cp -r walkout/.claude .
cp -r walkout/.cursor .
cp -r walkout/docs .

git add CLAUDE.md CURSOR.md BRANCHING.md WORKING-TOGETHER.md .claude .cursor docs
git commit -m "chore: add AI-assisted build setup, agents, and PRD modules"
```

If `.claude/` or `.cursor/` already exist, merge contents instead of overwriting.

## First-Day Reading List

Before either of you ships your first PR, read in this order:

1. **`WORKING-TOGETHER.md`** (both of you, ~10 minutes). The day-to-day playbook. Tells you how the parallel build works, who owns what, what to do when blocked.
2. **`BRANCHING.md`** (both of you, ~5 minutes). The three git rules. The most important one is "schema migrations are serialized through Michael" — internalize it.
3. **`CLAUDE.md`** (Michael) or **`CURSOR.md`** (cofounder), depending on which tool you're using (~5 minutes). Your tool's operating manual. Describes the agent roster and the project standards.
4. **`docs/prd/00-overview.md`** (both, ~10 minutes). Strategic context. Personas. User flows. Money math overview.
5. **The PRD module for whatever you're building first.** During Phase 1, that's `01-architecture-schema.md` and `03-auth-staff-rbac.md`.

Total time: ~30 minutes. Don't skip it. The setup costs more time than this if you skip the playbook.

## Tooling

- **Michael uses Claude Code.** Agents in `.claude/agents/`. Mention them with `@orchestrator`, `@code-reviewer`, etc. Sub-agent dispatch via the Task tool is automatic.
- **Cofounder uses Cursor 3.** Agents in `.cursor/agents/`. Same agents, same names, mention syntax matches. Cursor's agent system was added in 2.5 (Feb 2026); 3.0 (March 2026) consolidates everything in the Agents Window.
- **Both share the same repo, the same `main` branch, the same PRD modules.** The two `.<tool>/agents/` directories coexist — having both does not cause problems.

## How the Agents Work

Eight agents (one shared model, two interfaces). The first one is the lead; the other six are specialists.

| Agent | When to use |
|---|---|
| `orchestrator` | Multi-domain features. Decomposes, recommends specialists, synthesizes. Always start here for anything bigger than a one-file change. |
| `code-reviewer` | Every PR before merge. No exceptions. |
| `security-reviewer` | Payments, auth, tokens, webhooks, RBAC, guest migration. The adversarial-review agent. |
| `database-reviewer` | Every Prisma migration and schema change. (Michael's territory per Rule 3.) |
| `build-error-resolver` | Build / typecheck / Prisma errors. Root-cause focused, no architectural rewrites. |
| `code-explorer` | Read-only subsystem mapping before unfamiliar work. Returns a map, not edits. |
| `tdd-guide` | Money-touching code (`src/lib/payment/`, `src/lib/tax/`, `src/lib/tip/`). Failing test first. |

Each agent knows which PRD modules to load for its task. You don't paste PRD sections into prompts — agents retrieve what they need.

## How the PRD Split Works

Eight markdown modules under `docs/prd/`. Each agent loads only the modules relevant to its current task. The orchestrator picks the modules for multi-domain work; specialists default to a small set of always-relevant modules plus whatever the user task points at.

| Working on… | Modules |
|---|---|
| New schema or migration | 00, 01, 06 |
| Capture / hold / tip logic | 00, 01, 02, 06 |
| Auth, staff invite, RBAC | 00, 03, 06 |
| KDS, cash, service requests | 00, 01, 04 |
| Dashboard or diner UI | 00, 05 |
| Phase planning | 00, 07 |
| Anything security-adjacent | 00, 06 + the module covering your feature |

## Versioning

All files reflect PRD v5.2 (April 2026). Key v5.2 behavior the agents enforce:

- **One combined capture per tab**, not two (v5.1 two-charge model is gone).
- **20% default tip** after 15-minute `AWAITING_TIP` window.
- **"Table Cleared" never fires capture** — seating and payment are independent state machines.
- **Pro-rata fee allocation** written to `feeAllocatedTo*` fields at capture.
- **Floor-then-remainder** overflow prorating.
- **Idempotency keys include attempt counter**, incremented before the Stripe call.

When the PRD changes, update the relevant module in `docs/prd/` in the same PR. Agents treat modules as authoritative over their internal knowledge.

## Customization

Every file here is yours to edit. Notes:

- `CLAUDE.md` and `CURSOR.md` are the files you'll edit most. Update when stack or conventions change.
- New agent? Add it in BOTH `.claude/agents/` and `.cursor/agents/`. Update the agent roster table in `CLAUDE.md` and `CURSOR.md`.
- New PRD module? Update the "PRD Module Map" in `CLAUDE.md`, `CURSOR.md`, and the README.

## Current Phase

**Phase 1: Foundation + RBAC, Weeks 1–2.** See `docs/prd/07-build-plan.md` for week-by-week work items, and `WORKING-TOGETHER.md` § "Phase 1" for the explicit work-item assignments.

---

Built for Michael and his cofounder. Drop in the files, read the playbook, ship Phase 1 in week 1.
