import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 prose prose-neutral dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">
        {/* TODO(legal): final review — US-focused stub; retention aligns with PRD §25.9 */}
      </p>

      <h2>What we collect</h2>
      <p>
        We collect account and transaction data needed to operate checkout, tipping, and restaurant dashboards — for
        example contact information, device identifiers necessary for fraud prevention, order and payment metadata,
        and operational logs for reliability and security.
      </p>

      <h2>How we use data</h2>
      <p>
        Data is used to provide the WalkOut service, authenticate users, process payments through our processors,
        deliver notifications you configure, improve reliability, and comply with law.
      </p>

      <h2>Retention</h2>
      <p>
        We retain operational and financial records as needed for disputes, accounting, and legal compliance; specific
        retention windows follow internal policy and processor requirements (see PRD §25.9).
      </p>

      <h2>Your choices</h2>
      <p>
        You may access or update certain profile fields in-product; deletion requests are handled subject to legitimate
        business and legal retention needs.
      </p>

      <p className="not-prose mt-10">
        <Link href="/" className="text-sm underline">
          ← Home
        </Link>
      </p>
    </main>
  );
}
