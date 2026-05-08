# Phase 6 — API input audit (Zod)

Spot-check of route handlers using Zod for **trim**, **max length**, and sensible caps on free-text fields.

| Route / area | Status | Notes |
|--------------|--------|-------|
| `POST /api/restaurant/tables` | Updated | `tableNumber`: `.trim()`, `.max(20)` |
| `PATCH /api/restaurant/settings` | Updated | Cloud print id trimmed; `taxLabel`/`timezone` trimmed + max; tax rate bounded |
| `POST /api/sessions/[sessionId]/orders` | OK | Uses validated menu + quantity (review notes field if extended) |
| `POST /api/join/[nfcTagId]` | Review | Confirm display name / notes schemas use `.trim().max()` where present |
| `POST /api/diner/migrate-from-guest` | Review | Existing limits; verify email/name trim |
| `POST /api/auth/diner/register` | Review | Confirm `.trim()` on strings |
| `PATCH /api/restaurant/menu/items/[id]` | Review | Item name/description caps |
| `POST /api/restaurant/staff/invite` | Review | Email/name trim + max |

**Convention:** Prefer `z.string().trim().min(1).max(N)` for human-entered labels; use `.max()` on all optional notes.

This file is a living checklist — extend rows as new routes ship.
