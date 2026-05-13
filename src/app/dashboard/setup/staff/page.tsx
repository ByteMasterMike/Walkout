'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PageShell, PageHead } from '@/components/pitch';

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
  inviteStatus: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  isActive: boolean;
  invitedAt: string;
  acceptedAt: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager',
  STAFF: 'Staff',
};

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'ADMIN' | 'MANAGER' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'STAFF' | 'MANAGER'>('STAFF');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/restaurant/staff');
      if (res.status === 403) { router.replace('/dashboard'); return; }
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff); setUserRole(data.role ?? null);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);

    const res = await fetch('/api/restaurant/staff/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        typeof body.error === 'string'
          ? body.error
          : 'Failed to send invite. Please try again.'
      );
    } else {
      setSuccessMsg(`Invite sent to ${email}`);
      setName('');
      setEmail('');
      setRole('STAFF');
      const refreshRes = await fetch('/api/restaurant/staff');
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setStaff(data.staff); setUserRole(data.role ?? null);
      }
    }
    setSubmitting(false);
  }

  return (
    <PageShell>
      <PageHead
        title={
          <>
            Staff <em>management</em>
          </>
        }
        subtitle={<>Invite team members. They receive an email to set their password and activate their account.</>}
      />

      <div className="card mb-10">
        <h3 className="font-display text-2xl font-light text-foreground">Invite a team member</h3>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="Alex Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'STAFF' | 'MANAGER')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
            >
              <option value="STAFF">Staff — can view tables, KDS, and service requests</option>
              {userRole === 'ADMIN' && (
                <option value="MANAGER">Manager — can also edit menu, floor setup, and analytics</option>
              )}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {successMsg && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {successMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Sending invite...' : 'Send invite'}
          </button>
        </form>
      </div>

      <div className="mono mb-3 mt-40">Team members</div>
      {loading ? (
        <p className="py-6 text-center font-body text-sm text-muted-foreground">Loading...</p>
      ) : staff.length === 0 ? (
        <p className="py-10 text-center font-body text-sm text-muted-foreground">
          No staff yet. Send an invite above.
        </p>
      ) : (
        <div className="staff-list">
          {staff.map((member) => (
            <div key={member.id} className="staff-row">
              <div className="l">
                <div className="av">{member.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className="nm">{member.name}</div>
                  <div className="em">{member.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="role">{ROLE_LABELS[member.role]}</span>
                <span
                  className={`badge ${member.inviteStatus === 'PENDING' ? 'pen' : 'act'}`}
                >
                  {member.inviteStatus === 'PENDING'
                    ? 'Pending'
                    : member.inviteStatus === 'ACCEPTED'
                      ? 'Active'
                      : 'Expired'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
