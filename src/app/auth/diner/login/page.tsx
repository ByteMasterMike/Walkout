import { Suspense } from 'react';
import DinerLoginClient from './DinerLoginClient';

export default function DinerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50 text-sm text-neutral-500">
          Loading…
        </div>
      }
    >
      <DinerLoginClient />
    </Suspense>
  );
}
