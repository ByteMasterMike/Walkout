import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Returns the Stripe client, initialising it on first use.
 * Lazy init prevents the module-level throw from crashing build-time
 * route collection when STRIPE_SECRET_KEY is not set in the build environment.
 *
 * Call getStripe() inside route handlers and server actions, never at module scope.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }
  return _stripe;
}

// Convenience re-export for callers that prefer `stripe.xxx` syntax.
// Accessing this property also triggers lazy init.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
