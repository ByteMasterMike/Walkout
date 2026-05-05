# WalkOut — AI-Assisted Build Setup

Drop-in scaffold for building WalkOut as a two-person team using **Cursor**. Includes operating manuals, Cursor agent definitions, the PRD v5.2 split into modules, and a parallel-build playbook.

## Layout

```
.
├── MICHAEL.md                             ← Technical lead manual (Michael)
├── CURSOR.md                              ← Cofounder manual (Cursor)
├── BRANCHING.md                           ← Trunk-based git rules + PR workflow
├── WORKING-TOGETHER.md                    ← The two-person playbook (read this)
├── README.md                              ← You are here
│
├── .cursor/
│   └── agents/                            ← 7 Cursor agents (@mention by name)
│       ├── orchestrator.md
│       ├── code-reviewer.md
│       ├── security-reviewer.md
│       ├── database-reviewer.md
│       ├── build-error-resolver.md
│       ├── code-explorer.md
│       └── tdd-guide.md
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
cp walkout/MICHAEL.md .
cp walkout/CURSOR.md .
cp walkout/BRANCHING.md .
cp walkout/WORKING-TOGETHER.md .
cp -r walkout/.cursor .
cp -r walkout/docs .

git add MICHAEL.md CURSOR.md BRANCHING.md WORKING-TOGETHER.md .cursor docs
git commit -m "chore: add AI-assisted build setup, Cursor agents, and PRD modules"
```

If `.cursor/` already exists, merge contents instead of overwriting.

## First-Day Reading List

Before either of you ships your first PR, read in this order:

1. **`WORKING-TOGETHER.md`** (both of you, ~10 minutes). The day-to-day playbook.
2. **`BRANCHING.md`** (both of you, ~5 minutes). Schema migrations serialize through Michael — internalize that.
3. **`MICHAEL.md`** (Michael) and **`CURSOR.md`** (cofounder). Same standards; MICHAEL has the canonical PR module index and full payment invariant list.
4. **`docs/prd/00-overview.md`** (both). Strategic context.
5. **The PRD module for whatever you're building first.**

## Tooling

- **Michael and cofounder both use Cursor.** Invoke agents from **`.cursor/agents/`** with **`@orchestrator`**, **`@code-reviewer`**, etc. No Claude Code folder or Task tool — delegate with explicit `@mentions` or follow-on prompts after the orchestrator lists steps.
- **Both share one repo and one `.cursor/` tree.**

## How the Agents Work

| Agent | When to use |
|---|---|
| `orchestrator` | Multi-domain features. Decompose, recommend specialists, synthesize. |
| `code-reviewer` | Every PR before merge. |
| `security-reviewer` | Payments, auth, tokens, webhooks, RBAC, guest migration. |
| `database-reviewer` | Every Prisma migration and schema change (Michael's territory per Rule 3). |
| `build-error-resolver` | Build / typecheck / Prisma errors. |
| `code-explorer` | Read-only subsystem mapping before unfamiliar work. |
| `tdd-guide` | Money-touching code (`src/lib/payment/`, `src/lib/tax/`, `src/lib/tip/`). |

## Customization

- **`MICHAEL.md`** — update when migration policy, invariant list, or agent roster wording changes for engineering.
- **`CURSOR.md`** — update onboarding and cofounder-visible tone; keep architectural rules aligned with MICHAEL.
- **New agent?** Add **``.cursor/agents/<name>.md`** and roster rows in **`MICHAEL.md`**, **`CURSOR.md`**, and this README.
- **New PRD module?** Update **`MICHAEL.md`** (PRD Modules), **`CURSOR.md`**, and **`docs/prd/`**.

## Versioning

Reflects PRD v5.2 (April 2026). Highlights: one combined capture per tab, 20% default tip after 15 minutes, Table Cleared does not capture, pro-rata fee allocation, idempotency keys with attempt counters.

## How the PRD Split Works

Eight markdown modules under `docs/prd/`. Each agent loads only what the task needs. The orchestrator picks modules for multi-domain work.

| Working on… | Modules |
|---|---|
| New schema or migration | 00, 01, 06 |
| Capture / hold / tip logic | 00, 01, 02, 06 |
| Auth, staff invite, RBAC | 00, 03, 06 |
| KDS, cash, service requests | 00, 01, 04 |
| Dashboard or diner UI | 00, 05 |
| Phase planning | 00, 07 |
| Anything security-adjacent | 00, 06 + the module covering your feature |

Each agent hints which PRD files to pull; you rarely paste sections into prompts.

## Current Phase

**Phase 1: Foundation + RBAC, Weeks 1–2.** See `docs/prd/07-build-plan.md` for work items and `WORKING-TOGETHER.md` Phase 1 for assignments.

---

Built for Michael and his cofounder. Drop in the files, read the playbook, ship Phase 1.
