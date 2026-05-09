-- Phase 5: optional diner analytics / session freshness
ALTER TABLE "diners" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
