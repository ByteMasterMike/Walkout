import Link from 'next/link';

export default function AnalyticsHubPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Analytics</h1>
      <p className="text-sm text-neutral-500">Reports and operational metrics for your restaurant.</p>
      <ul className="space-y-3">
        <li>
          <Link href="/dashboard/analytics/tips" className="block border border-neutral-200 rounded-xl px-4 py-3 hover:bg-neutral-50">
            <span className="font-medium text-neutral-900">Tips</span>
            <span className="block text-xs text-neutral-500 mt-1">Direct mode totals · tip pools · CSV</span>
          </Link>
        </li>
        <li>
          <a
            href={`/api/restaurant/analytics/tax/quarterly?year=${new Date().getFullYear()}&quarter=${Math.ceil((new Date().getMonth() + 1) / 3)}`}
            className="block border border-neutral-200 rounded-xl px-4 py-3 hover:bg-neutral-50"
          >
            <span className="font-medium text-neutral-900">Quarterly tax CSV</span>
            <span className="block text-xs text-neutral-500 mt-1">Download snapshotted tax amounts by day</span>
          </a>
        </li>
        <li>
          <Link
            href="/dashboard/analytics/requests"
            className="block border border-neutral-200 rounded-xl px-4 py-3 hover:bg-neutral-50"
          >
            <span className="font-medium text-neutral-900">Service requests</span>
            <span className="block text-xs text-neutral-500 mt-1">Volume and response times</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
