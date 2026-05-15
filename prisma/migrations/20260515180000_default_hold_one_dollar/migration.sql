-- Default card authorization hold: $1.00 (100 cents)
ALTER TABLE "restaurants" ALTER COLUMN "defaultHoldAmount" SET DEFAULT 100;
UPDATE "restaurants" SET "defaultHoldAmount" = 100;
