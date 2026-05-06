-- AlterEnum: payment lifecycle states on TabSession (PRD §11.6)
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_TIP';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'CAPTURING';

-- Track why the session entered AWAITING_TIP (idle vs diner checkout vs safety net)
ALTER TABLE "tab_sessions" ADD COLUMN IF NOT EXISTS "departureSource" "DepartureSource";
