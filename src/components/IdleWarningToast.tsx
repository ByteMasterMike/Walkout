'use client';

interface Props {
  onDismiss: () => void;
}

/**
 * Shown after 10 minutes of inactivity on the diner tab page.
 * Warns the diner their session may close, prompting re-engagement.
 * PRD §11.5: idle sessions trigger the departure cron after 2h; this toast
 * fires at the 10-min mark as an early warning.
 */
export default function IdleWarningToast({ onDismiss }: Props) {
  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="Idle warning"
      className="fixed bottom-6 left-4 right-4 z-50 max-w-sm mx-auto bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-4"
    >
      <p className="text-sm font-semibold mb-1">Still there?</p>
      <p className="text-xs text-gray-300 mb-4">
        Your tab is still open. If you leave without paying, your card on file will be charged
        for your current balance.
      </p>
      <button
        onClick={onDismiss}
        className="w-full py-2.5 bg-white text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-100 transition-colors"
      >
        I&apos;m still here
      </button>
    </div>
  );
}
