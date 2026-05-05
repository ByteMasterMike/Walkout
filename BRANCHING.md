# BRANCHING.md — How We Use Git

Trunk-based development with three rules. Read this before your first PR.

## The Three Rules

### Rule 1: Short branches off `main`

Every branch starts from the latest `main` and lives 2–24 hours. If a branch is approaching the 24-hour mark, push what you have, mark it `[WIP]`, get it reviewed, and merge — don't let it grow.

```bash
git checkout main
git pull
git checkout -b feat/menu-crud
# work, commit, push, PR
```

The reason for the time limit is that AI-assisted development moves fast, and a branch that lives for three days gets out of sync with `main` faster than you can manually rebase. Short branches mean less rebasing and fewer "the AI built this against an outdated assumption" surprises.

### Rule 2: One PRD module per branch

Each branch's diff should map cleanly to one of the modules under `docs/prd/`. A branch named `feat/menu-crud` touches files described in module 05. A branch named `feat/capture-flow` touches files described in module 02.

If a feature actually spans modules — for example, "add tip pool distribution" needs schema changes in 01, payment logic in 02, and UI in 05 — split it into three branches with explicit handoff points. The `orchestrator` agent is good at producing the split. Use it.

The reason for this rule is that PR review (by the agent and by your cofounder) gets exponentially harder as the surface area of a PR grows. A 200-line PR scoped to one module gets a careful review. A 2,000-line PR spanning four modules gets a rubber-stamp review, and that's where bugs slip through.

### Rule 3: Schema migrations are serialized through Michael

This is the rule that prevents the worst class of merge conflicts.

Cofounder workflow when you need a schema change:
1. Slack Michael: "I need a `tipPromptSentAt` column on `TabParticipant`. Working in `feat/tip-prompt-ui`."
2. Michael writes the migration on `feat/migration-tipPromptSentAt`, gets it reviewed by `database-reviewer`, merges to `main`.
3. Cofounder rebases their branch on the new `main`, picks up the column, continues building UI.

Steps 1–2 typically take 15–30 minutes. The reason for this rule is that two divergent migration directories cannot be merged automatically by Prisma — one of them has to be discarded and re-generated, which loses work and risks data corruption on staging. Serializing migrations through one person prevents this entirely.

If Michael is asleep and the cofounder is blocked, write the feature code with a commented-out reference to the future column and stub the data — do not run `prisma migrate dev` yourself.

## Branch Naming

Format: `<type>/<short-description>`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Examples:
- `feat/menu-crud`
- `feat/floor-setup-ui`
- `fix/capture-overflow-rounding`
- `chore/upgrade-prisma`
- `migration/add-tip-prompt-sent-at` (Michael only, for migrations)

Avoid: `feature-1`, `wip`, `mike-stuff`, branch names with the date in them. Future-you reading the git log wants to know what changed, not when.

## Commit Format

Conventional Commits:

```
<type>: <description>

<optional body>

<optional footer>
```

Types match branch types. Examples:

```
feat: add Featured Items row to /tab/[sessionId]

Uses MenuItem.isPopular flag. Horizontal scroll on mobile.
References PRD §22.2.

Closes #42
```

```
fix: correct overflow fee prorating to use floor-then-remainder

Math.round on both halves can sum to one cent more than
applicationFeeCents. PRD §11.5.
```

Body is optional for trivial commits but required when the diff isn't self-explanatory. Footer references issue numbers when applicable.

## PR Workflow

### When you push a branch:

1. Open a PR against `main`.
2. Title: same format as your commit. Description: what changed, why, and what PRD section it implements.
3. Tag the PR with the relevant module: `module-02`, `module-05`, etc. (use GitHub labels).
4. **Run `@code-reviewer`** in your AI tool against the diff.
5. **If the diff touches payments, auth, webhooks, RBAC, or tokens**: run `@security-reviewer` too.
6. **If the diff includes a Prisma migration**: run `@database-reviewer`. (Michael's branches only.)
7. Address any CRITICAL findings. Address HIGH findings or explicitly note why you're deferring them.
8. Merge.

### PR template

Put this in `.github/pull_request_template.md` (Michael will set up):

```markdown
## What

<one-sentence summary>

## Why / PRD reference

<§X.Y from docs/prd/>

## How

<key implementation choices, especially anything non-obvious>

## Tests

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Unit tests pass (`npm test`)
- [ ] Manually tested locally

## Agents run

- [ ] @code-reviewer — verdict: ___
- [ ] @security-reviewer (if applicable) — verdict: ___
- [ ] @database-reviewer (if migration) — verdict: ___

## Risk

<LOW / MEDIUM / HIGH and why>

## Screenshots / output

<if UI change or noteworthy script output>
```

### Merge protocol

- **APPROVE verdict from `code-reviewer`**: merge.
- **WARNING verdict**: discuss in PR comments. Merge if both authors agree the HIGH issues are acceptable as follow-ups.
- **BLOCK verdict**: do not merge. Fix the CRITICAL items first.
- **Disagreement on a finding**: explain the disagreement in the PR. The agent might be wrong, but the burden is on the human to articulate why before overriding.

If you're the only one online and the change is genuinely urgent (production is down, a customer demo is in 10 minutes), you can self-merge with a note in the PR explaining why. Use sparingly — "I'm in a flow state" is not urgency.

## Rebasing vs Merging

We rebase, not merge, when pulling `main` into a branch.

```bash
git checkout feat/menu-crud
git fetch origin
git rebase origin/main
# resolve conflicts if any
git push --force-with-lease
```

`--force-with-lease` (not `--force`) is important — it refuses to overwrite if someone else pushed to the branch in the meantime.

PR merges into `main` use **squash merge**. The branch's commits collapse into one tidy commit on `main`. Clean history, easy to revert if needed.

## What to Do When You Hit a Conflict

If the conflict is in code: resolve it manually, commit, push.

If the conflict is in `prisma/schema.prisma` or `prisma/migrations/`: stop and ping Michael. Do not resolve a migration conflict by hand — it's the path to data corruption.

If the conflict is in `package-lock.json`: delete it, run `npm install`, commit the regenerated file. (Same for `yarn.lock` / `pnpm-lock.yaml`.)

## CI

Even before we set up GitHub Actions formally, every push runs locally:
- `npm run typecheck` — must pass
- `npm run lint` — must pass
- `npm run build` — must pass
- `npm test` — must pass for any PR touching tested code

A PR with failing checks does not merge. Period. If a check is failing because the test is wrong, fix the test in the same PR and explain why.

## Branch Cleanup

After merge, delete the branch:

```bash
git checkout main
git pull
git branch -d feat/menu-crud
git push origin --delete feat/menu-crud
```

Stale branches accumulate and confuse `git branch -a` output. Delete aggressively.

## Emergency Hotfix

For production bugs only. Same flow, abbreviated:

1. Branch from `main`: `hotfix/<short-description>`.
2. Fix the bug. Add a regression test if you can in the same PR.
3. Run `@code-reviewer` and `@security-reviewer` if applicable.
4. Merge.
5. Tag the merge commit: `git tag -a hotfix-2026-04-22 -m "..."`.

If the hotfix needs a schema migration, it's no longer a hotfix — it's a coordinated fix. Slack Michael, plan together.
