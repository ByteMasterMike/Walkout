'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';

export default function DinerLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/account';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const safeCallback = useMemo(() => {
    if (callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) return callbackUrl;
    return '/account';
  }, [callbackUrl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signIn('diner', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError('Invalid email or password.');
        return;
      }
      router.push(safeCallback);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Diner sign in</h1>
        <p className="text-sm text-neutral-500 mb-6">Manage your card, tip preferences, and history.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-neutral-500">
          No account?{' '}
          <Link href="/auth/diner/register" className="text-black font-medium underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
