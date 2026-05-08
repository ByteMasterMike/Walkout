'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function DinerRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/diner/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not register');
        return;
      }
      router.push('/auth/diner/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Create diner account</h1>
        <p className="text-sm text-neutral-500 mb-6">Save your preferences for faster checkout next visit.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Password (min 12)</label>
            <input
              type="password"
              required
              minLength={12}
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
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account?{' '}
          <Link href="/auth/diner/login" className="text-black font-medium underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
