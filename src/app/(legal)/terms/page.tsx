import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 prose prose-neutral dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">
        {/* TODO(legal): final review — stub copy for Phase 6 launch readiness */}
      </p>

      <h2>Restaurant obligations</h2>
      <p>
        Operators are responsible for accurate menu pricing, tax configuration, and compliance with local labor and
        tip-pooling regulations. WalkOut provides software tooling only and does not provide legal or accounting
        advice.
      </p>

      <h2>WalkOut service fee</h2>
      <p>
        A WalkOut service fee may apply to digital transactions as disclosed in your merchant agreement and in-product
        settings. Fees are separate from card-network processing costs unless otherwise stated.
      </p>

      <h2>Tips &amp; tip pools</h2>
      <p>
        Tip distribution modes (direct vs pool) affect reporting and settlements. Operators remain responsible for
        lawful tip handling, notice requirements, and any tip credit compliance in their jurisdiction.
      </p>

      <h2>Processing fee allocation</h2>
      <p>
        Card processing fees may be allocated across food, tips, and fees according to your configured rules; review with
        counsel where tip-processing allocation is regulated.
      </p>

      <p className="not-prose mt-10">
        <Link href="/" className="text-sm underline">
          ← Home
        </Link>
      </p>
    </main>
  );
}
