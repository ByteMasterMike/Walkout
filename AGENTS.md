## Learned User Preferences

- When the user says "push" after implementation work, they expect the agent to run `git add`, `git commit`, and `git push` locally when the change set is clear, not only describe the git steps.
- Default to Cursor-oriented setup and docs (`.cursor/`, Cursor rules/manuals tied to Cursor). Do not lean on Claude-specific paths (`CLAUDE.md`, `.claude/`) unless the user asks to update them.
- For payment and Stripe failures, surface enough concrete detail to debug (error type, HTTP status, Stripe message or request identifier when appropriate) rather than only a generic "payment failed" message when that level of clarity is explicitly needed.
- When work is driven by an attached implementation plan, implement in code and todos only; do not edit the plan file itself.

## Learned Workspace Facts

- Restaurant Stripe onboarding for WalkOut is intended to stay on Express Connect (not Standard Connect with a full per-restaurant Stripe Dashboard) unless product requirements change.
- Customer-facing product and marketing copy use the name **WalkOut** (capital O), not "Walkout."
- Diner-facing and owner-facing experiences are separate splits; do not mirror the reference demo HTML pattern of pairing both as top-level entry points in the main chrome.
- Diner tab flow on web should show the menu as a full-page layout (not a phone-frame cutout), and must not skip diners straight to pay before they can browse and use the menu.
- Card authorization holds for the diner tab are intended to use a one-dollar ($1) hold amount consistently across configuration and code paths unless product requirements change.
