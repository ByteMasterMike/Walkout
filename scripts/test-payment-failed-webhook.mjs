#!/usr/bin/env node
/**
 * End-to-end test: Stripe payment_intent.payment_failed → webhook → Twilio SMS (if diner has phone).
 *
 * Prereqs:
 *   1. Install Stripe CLI: https://stripe.com/docs/stripe-cli (Windows: scoop install stripe / winget)
 *   2. Terminal A: stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *      Copy the printed whsec_… into .env.local as STRIPE_WEBHOOK_SECRET (must match listen session).
 *   3. Terminal B: npm run dev (restart after changing STRIPE_WEBHOOK_SECRET)
 *   4. .env.local: STRIPE_SECRET_KEY (test), DATABASE_URL, TWILIO_* , RESEND optional for email leg
 *
 * DB: At least one TabParticipant linked to a Diner with phone (E.164, e.g. +15551234567),
 *      and a Restaurant with stripeConnectAccountId (Express Connect account).
 *
 * Usage: node scripts/test-payment-failed-webhook.mjs
 *
 * Optional env:
 *   SMS_TEST_PHONE=+15551234567 — if no diner has phone, sets phone on the first participant's diner (dev only).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const prisma = new PrismaClient();

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error('Missing STRIPE_SECRET_KEY');
    process.exit(1);
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn(
      '[warn] STRIPE_WEBHOOK_SECRET is unset. Webhook route will return 401.\n' +
        '       Run: stripe listen --forward-to localhost:3000/api/webhooks/stripe\n' +
        '       Paste the whsec into .env.local and restart npm run dev.\n',
    );
  }

  let participant = await prisma.tabParticipant.findFirst({
    where: { diner: { phone: { not: null } } },
    include: {
      diner: true,
      session: { include: { restaurant: true } },
    },
  });

  const testPhone = process.env.SMS_TEST_PHONE?.trim();
  if (!participant && testPhone) {
    const any = await prisma.tabParticipant.findFirst({
      where: { dinerId: { not: null } },
      include: {
        diner: true,
        session: { include: { restaurant: true } },
      },
    });
    if (any?.dinerId) {
      await prisma.diner.update({
        where: { id: any.dinerId },
        data: { phone: testPhone },
      });
      participant = await prisma.tabParticipant.findFirst({
        where: { id: any.id },
        include: {
          diner: true,
          session: { include: { restaurant: true } },
        },
      });
      console.log(`[dev] Set diner phone to SMS_TEST_PHONE for participant ${any.id}`);
    }
  }

  if (!participant?.diner?.phone) {
    console.error(
      'No TabParticipant with a Diner phone. Add phone to a diner (account/join flow) or set SMS_TEST_PHONE in .env.local and rerun.',
    );
    process.exit(1);
  }

  const acct = participant.session.restaurant.stripeConnectAccountId;
  if (!acct) {
    console.error(
      'Restaurant has no stripeConnectAccountId. Complete Stripe Connect onboarding at /dashboard/setup/stripe first.',
    );
    process.exit(1);
  }

  const stripe = new Stripe(secret, { apiVersion: '2023-10-16' });

  console.log('Creating PaymentIntent on connected account (no confirm yet)...');
  const pi = await stripe.paymentIntents.create(
    {
      amount: 2000,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: { walkout_test: 'payment_failed_sms' },
    },
    { stripeAccount: acct },
  );

  await prisma.tabParticipant.update({
    where: { id: participant.id },
    data: { stripePaymentIntentId: pi.id },
  });
  console.log(`Linked participant ${participant.id} → ${pi.id}`);

  console.log('Confirming with declining test card (pm_card_chargeDeclined)...');
  try {
    await stripe.paymentIntents.confirm(
      pi.id,
      { payment_method: 'pm_card_chargeDeclined' },
      { stripeAccount: acct },
    );
  } catch (e) {
    // Declined cards often throw; Stripe still emits payment_intent.payment_failed
    const msg = e instanceof Error ? e.message : String(e);
    console.log('confirm() threw (expected for decline):', msg.slice(0, 200));
  }

  console.log('\nDone. If stripe listen is forwarding and STRIPE_WEBHOOK_SECRET matches listen:');
  console.log('  • POST /api/webhooks/stripe should log the event');
  console.log('  • Twilio SMS should send to', participant.diner.phone);
  console.log('  • Watch npm run dev terminal for [sms] or Twilio errors\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
