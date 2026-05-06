'use client';

import { motion } from 'framer-motion';
import { Zap, DollarSign, Monitor } from 'lucide-react';

const highlights = [
  { icon: DollarSign, text: 'No monthly software fee — ever' },
  { icon: Zap, text: 'Tap to open a tab, walk out when done' },
  { icon: Monitor, text: 'Kitchen display included free' },
];

function ChevronLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" fill="none">
      <defs>
        <linearGradient id="auth-chev-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0b36a" />
          <stop offset="100%" stopColor="#b96e1e" />
        </linearGradient>
      </defs>
      <path d="M4 5 L17 16 L4 27 L9 27 L22 16 L9 5 Z" fill="url(#auth-chev-grad)" />
      <path d="M18 5 L31 16 L18 27 L23 27 L36 16 L23 5 Z" fill="url(#auth-chev-grad)" opacity="0.45" />
    </svg>
  );
}

export default function AuthPanel() {
  return (
    <div className="relative hidden h-full min-h-[calc(100vh-4rem)] overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-deep/30 via-amber/10 to-transparent" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-amber/15 blur-[100px]" />
      <div className="pointer-events-none absolute -top-16 -left-16 h-[300px] w-[300px] rounded-full bg-amber-deep/10 blur-[80px]" />

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 flex items-center gap-3"
      >
        <ChevronLogo className="h-6 w-10" />
        <span className="font-display text-xl font-light italic tracking-tight text-paper">
          walkout
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
        className="relative z-10 space-y-6"
      >
        <h2 className="font-display text-4xl font-light leading-tight tracking-tight text-paper">
          An operating system{' '}
          <span className="italic text-amber">for restaurants.</span>
        </h2>

        <div className="space-y-3">
          {highlights.map((h, i) => {
            const Icon = h.icon;
            return (
              <motion.div
                key={h.text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex items-center gap-3 text-sm text-paper/70"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber/20">
                  <Icon className="h-3.5 w-3.5 text-amber" />
                </div>
                {h.text}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        className="relative z-10 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40"
      >
        Walkout, 2026 — Warminster, PA
      </motion.p>
    </div>
  );
}
