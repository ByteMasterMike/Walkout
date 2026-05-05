'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  ACCEPTED: 'bg-green-50 text-green-700 border-green-200',
  EXPIRED: 'bg-gray-100 text-gray-500 border-gray-200',
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

  async function loadStaff() {
    const res = await fetch('/api/restaurant/staff');
    if (res.status === 403) {
      router.replace('/dashboard');
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setStaff(data.staff);
      setUserRole(data.role ?? null);
    }
    setLoading(false);
  }

  useEffect(() => { loadStaff(); }, []);

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
      await loadStaff();
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Staff Management</h1>
      <p className="text-sm text-gray-500 mb-8">
        Invite team members. They receive an email to set their password and activate their account.
      </p>

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Invite a team member</h2>
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

      {/* Staff list */}
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Team members</h2>
      {loading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading...</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">
          No staff yet. Send an invite above.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {staff.map((member) => (
            <div key={member.id} className="flex items-center justify-between px-4 py-3 bg-white">
              <div>
                <p className="text-sm font-medium text-gray-900">{member.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{member.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <span className="text-xs text-gray-500">{ROLE_LABELS[member.role]}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[member.inviteStatus]}`}
                >
                  {member.inviteStatus === 'PENDING'
                    ? 'Invite pending'
                    : member.inviteStatus === 'ACCEPTED'
                    ? 'Active'
                    : 'Expired'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
