'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PhoneFrame } from '@/components/pitch';
import { formatDefaultHoldUsd } from '@/lib/payment/holdConfig';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function TickNumber({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 1400;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, to]);

  return <span ref={ref}>{value.toLocaleString()}{suffix}</span>;
}

function ChevronLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" fill="none">
      <defs>
        <linearGradient id="home-chev" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0b36a" />
          <stop offset="100%" stopColor="#b96e1e" />
        </linearGradient>
      </defs>
      <path d="M4 5 L17 16 L4 27 L9 27 L22 16 L9 5 Z" fill="url(#home-chev)" />
      <path d="M18 5 L31 16 L18 27 L23 27 L36 16 L23 5 Z" fill="url(#home-chev)" opacity="0.45" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative min-h-screen px-6 pt-32 pb-20 md:px-10">
      <div className="absolute top-24 left-10 hidden font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:block">
        Est. 2026<br /><span className="text-primary">Warminster, PA</span>
      </div>
      <div className="absolute top-24 right-10 hidden text-right font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:block">
        A restaurant operating system<br /><span className="text-primary">v4.0</span>
      </div>

      <motion.h1
        className="font-display text-[clamp(64px,14vw,200px)] font-light leading-[0.88] tracking-[-0.045em]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <span className="block overflow-hidden">
          <motion.span className="inline-block" initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1], delay: 0.4 }}>
            No&nbsp;check.
          </motion.span>
        </span>
        <span className="block overflow-hidden">
          <motion.span className="inline-block italic text-primary" initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1], delay: 0.6 }}>
            No&nbsp;wait.
          </motion.span>
        </span>
        <span className="block overflow-hidden">
          <motion.span className="inline-block" initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1], delay: 0.9 }}>
            Just&nbsp;go.
          </motion.span>
        </span>
      </motion.h1>

      <div className="mt-20 grid grid-cols-1 gap-12 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.4 }}>
          <p className="max-w-[460px] font-body text-lg leading-relaxed text-foreground md:text-xl">
            WalkOut is the operating system that turns a meal into a <em className="italic text-primary">tap, eat, leave</em>. Dining the way it was always supposed to feel. Because the best service is the kind you never have to think about.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px w-10 bg-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">A complete replacement for the point of sale</span>
          </div>
          <div className="mt-8 flex gap-3">
            <Link href="/auth/register">
              <Button size="lg">Get Started Free</Button>
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="lg">Sign In</Button>
            </Link>
          </div>
        </motion.div>

        <motion.div className="flex flex-col items-end" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.5 }}>
          <div className="font-display text-7xl font-light tracking-[-0.04em] text-primary md:text-8xl">
            $<TickNumber to={472} /><span className="text-muted-foreground/60">/mo</span>
          </div>
          <p className="mt-2 max-w-[200px] text-right font-body italic text-muted-foreground">
            saved by a 40-seat room switching from the incumbent
          </p>
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TICKER
   ═══════════════════════════════════════════════════════════════ */

const tickerItems = [
  'free software',
  'bring your own hardware',
  'pay on arrival, not departure',
  'zero sunk cost',
  'one tap to open a tab',
  'walk out when you\u2019re done',
];

function Ticker() {
  return (
    <div className="overflow-hidden border-y border-border py-5">
      <div className="flex animate-marquee gap-20 whitespace-nowrap">
        {[...tickerItems, ...tickerItems].map((item, i) => (
          <span key={i} className="font-display text-3xl font-light italic text-foreground/90 md:text-4xl">
            {i % 2 === 1 ? <em>{item}</em> : item}
            {i < tickerItems.length * 2 - 1 && <span className="ml-20 text-primary">·</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DINER PHONE MOCKUP
   ═══════════════════════════════════════════════════════════════ */

const chapters = [
  { num: '01', title: 'Tap in.', desc: 'Sticker recognises the phone. Session opens. Hold placed silently on card on file.' },
  { num: '02', title: 'The menu.', desc: 'Every dish, category, dietary tag and modifier. Designed by the house.' },
  { num: '03', title: 'Order freely.', desc: 'Add, split, modify. Every item snapshots price and tax at the moment you ordered it.' },
  { num: '04', title: 'Walk out.', desc: 'Staff clears the table — or 15 minutes of idle does it for them. The card finishes itself.' },
];

function DinerSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setActive((p) => (p + 1) % 4), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="diner" className="border-t border-border px-6 py-28 md:px-14">
      <Reveal>
        <div className="mb-16">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">No. 01 — The diner</span>
          <h2 className="mt-3 font-display text-4xl font-light tracking-[-0.035em] md:text-6xl">
            A meal that <em className="italic text-primary">pays itself.</em>
          </h2>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <h3 className="font-display text-5xl font-light tracking-[-0.035em] leading-[0.95] md:text-6xl">
            One tap <em className="italic">opens</em> the tab.
          </h3>
          <p className="mt-8 font-body text-lg italic text-muted-foreground">
            A sticker on the table. A phone near the sticker. The hold lands before the menu does.
          </p>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Zero hardware · iOS &amp; Android · Web NFC + QR fallback
          </p>
        </Reveal>

        <div className="flex justify-center lg:col-span-4">
          <Reveal>
            <PhoneFrame className="mx-auto" responsive>
              {active === 0 && (
                <motion.div
                  key="s1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="tab-screen-surface flex flex-1 flex-col items-center text-center"
                >
                  <div className="nfc" aria-hidden>
                    <div className="nfc-core">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M4 8v-1a2 2 0 012-2h1M4 16v1a2 2 0 002 2h1M20 8v-1a2 2 0 00-2-2h-1M20 16v1a2 2 0 01-2 2h-1M8 12c0-2 1.5-3 4-3s4 1 4 3-1.5 3-4 3-4-1-4-3z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <h2 className="d-h">
                    Welcome,
                    <br />
                    <em>Michael.</em>
                  </h2>
                  <p className="d-sub">Hold of {formatDefaultHoldUsd()} placed · Visa ····4242</p>
                </motion.div>
              )}
              {active === 1 && (
                <motion.div
                  key="s2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="tab-screen-surface flex min-h-0 flex-1 flex-col"
                >
                  <span className="d-pill">
                    <span className="dot" aria-hidden />
                    Table 7 · Menu
                  </span>
                  <div className="d-cats">
                    <span className="d-cat on" tabIndex={-1}>
                      Mains
                    </span>
                    <span className="d-cat" tabIndex={-1}>
                      Starters
                    </span>
                    <span className="d-cat" tabIndex={-1}>
                      Bar
                    </span>
                  </div>
                  <div className="d-list">
                    {[
                      { n: 'NY Strip Steak', pr: '38', d: '14oz, dry aged, rosemary butter' },
                      { n: 'Grilled Salmon', pr: '29', d: 'Atlantic, lemon beurre blanc' },
                      { n: 'Cacio e Pepe', pr: '24', d: 'Tonnarelli, pecorino romano' },
                    ].map((item) => (
                      <div key={item.n} className="d-item" role="presentation">
                        <div className="b">
                          <div className="top">
                            <span className="nm">{item.n}</span>
                            <span className="pr">{item.pr}</span>
                          </div>
                          <p className="dsc">{item.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
              {active === 2 && (
                <motion.div
                  key="s3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="tab-screen-surface flex min-h-0 flex-1 flex-col"
                >
                  <span className="d-pill">
                    <span className="dot" aria-hidden />
                    Table 7 · Ordering
                  </span>
                  <p className="d-h mt-2 !text-[28px] !leading-tight">Your tab.</p>
                  <div className="d-cart">
                    {[
                      { n: 'NY Strip Steak', q: '×1', pr: '38' },
                      { n: 'Caesar Salad', q: '×1', pr: '14' },
                      { n: 'Old Fashioned', q: '×2', pr: '30' },
                      { n: 'Truffle Fries', q: '×1', pr: '9' },
                    ].map((item) => (
                      <div key={item.n} className="d-citem">
                        <div className="flex items-baseline gap-2">
                          <span className="nm">{item.n}</span>
                          <span className="q">{item.q}</span>
                        </div>
                        <span className="pr">{item.pr}</span>
                      </div>
                    ))}
                  </div>
                  <div className="d-total">
                    <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--p-muted)]">Running total</span>
                    <p className="big">
                      91<span className="c">.00</span>
                    </p>
                  </div>
                </motion.div>
              )}
              {active === 3 && (
                <motion.div
                  key="s4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="tab-screen-surface flex flex-1 flex-col items-center text-center"
                >
                  <svg className="mt-2 shrink-0" width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden>
                    <circle cx="36" cy="36" r="34" stroke="#e89c4c" strokeWidth="1.5" />
                    <path
                      d="M22 37 L32 47 L52 27"
                      stroke="#e89c4c"
                      strokeWidth="2.2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <h2 className="d-h mt-4">
                    You&apos;re <em>out.</em>
                  </h2>
                  <p className="d-sub">Captured · Receipt emailed · Hold released</p>
                  <div className="mt-6 w-full text-left">
                    {[
                      ['Subtotal', '$91.00'],
                      ['PA Tax 6%', '$5.46'],
                      ['Service fee', '$0.46'],
                    ].map(([l, v]) => (
                      <div key={l} className="d-row">
                        <span>{l}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                    <div className="mt-2 flex justify-between border-t border-[rgba(232,156,76,0.3)] pt-3 font-mono text-sm text-[hsl(32_78%_60%)]">
                      <span className="italic">Charged</span>
                      <span>$96.92</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </PhoneFrame>
          </Reveal>
        </div>

        <nav className="flow-nav border-l border-border pl-8 lg:col-span-4" aria-label="Diner experience steps">
          {chapters.map((ch, i) => (
            <button
              key={ch.num}
              type="button"
              onClick={() => setActive(i)}
              className={active === i ? 'on' : 'opacity-55 hover:opacity-90'}
            >
              <span className="n">{ch.num}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-display text-xl font-light tracking-[-0.02em]">
                  <em className="italic">{ch.title}</em>
                </span>
                <span
                  className={`font-body text-sm italic text-muted-foreground transition-all ${
                    active === i ? 'max-h-24 opacity-100' : 'max-h-0 overflow-hidden opacity-0'
                  }`}
                >
                  {ch.desc}
                </span>
              </span>
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MONEY
   ═══════════════════════════════════════════════════════════════ */

const flowRows = [
  { idx: '01', who: 'Food & drink', detail: 'What the diner actually ate and drank.', amt: '$50', cents: '.00' },
  { idx: '02', who: 'Pennsylvania 6%', detail: 'Sales tax. Collected on the diner\'s behalf.', amt: '$3', cents: '.00', italic: true },
  { idx: '03', who: 'Walkout fee', detail: '0.5% of food. The only line we touch.', amt: '$0', cents: '.25' },
];

function MoneySection() {
  return (
    <section className="border-t border-border bg-paper px-6 py-28 text-ink md:px-10 dark:bg-paper dark:text-ink">
      <Reveal>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-deep">No. 02 — The money</span>
        <h2 className="mt-3 font-display text-4xl font-light tracking-[-0.035em] md:text-6xl">
          A fifty dollar meal, <em className="italic text-amber-deep">unfolded.</em>
        </h2>
      </Reveal>

      <Reveal className="mt-12">
        <div className="border-y border-ink/10">
          {flowRows.map((r) => (
            <div key={r.idx} className="grid grid-cols-12 items-baseline gap-4 border-b border-ink/10 py-5 last:border-b-0">
              <span className="col-span-1 font-mono text-xs text-ink/50">{r.idx}</span>
              <span className={`col-span-3 font-display text-2xl font-light tracking-[-0.02em] md:text-3xl ${r.italic ? 'italic' : ''}`}>{r.who}</span>
              <span className="col-span-4 font-body text-sm italic text-ink/60">{r.detail}</span>
              <span className="col-span-4 text-right font-display text-3xl font-light tracking-[-0.03em] md:text-4xl">
                {r.amt}<span className="text-ink/40">{r.cents}</span>
              </span>
            </div>
          ))}
          <div className="grid grid-cols-12 items-baseline gap-4 bg-ink px-4 py-6 -mx-4 text-paper md:-mx-6 md:px-6">
            <span className="col-span-1 font-mono text-xs text-paper/40">04</span>
            <span className="col-span-3 font-display text-3xl font-light italic tracking-[-0.02em] text-primary md:text-4xl">On the card</span>
            <span className="col-span-4 font-body text-sm italic text-paper/50">One charge at departure. One tip, optional.</span>
            <span className="col-span-4 text-right font-display text-4xl font-light tracking-[-0.03em] text-primary md:text-5xl">
              $53<span className="text-paper/40">.25</span>
            </span>
          </div>
        </div>
      </Reveal>

      <Reveal className="mt-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          <h3 className="font-display text-5xl font-light tracking-[-0.035em] md:text-6xl">
            Why it <em className="italic text-amber-deep">matters</em>.
          </h3>
          <div>
            <p className="font-body text-lg leading-relaxed">
              Every other point of sale charges a restaurant in <em className="italic text-amber-deep">three places</em>: monthly software, proprietary hardware that breaks, and a markup on top of processing. Walkout charges <em className="italic text-amber-deep">none of them</em>.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-6">
              {[{ n: '$0', l: 'Monthly software fee' }, { n: '$0', l: 'Proprietary hardware' }, { n: '2.9% + $.30', l: 'Processing — the Stripe rate' }].map((s) => (
                <div key={s.l} className="border-t border-ink/10 pt-4">
                  <div className="font-display text-4xl font-light tracking-[-0.03em]"><em className="italic text-amber-deep">{s.n}</em></div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IMPACT
   ═══════════════════════════════════════════════════════════════ */

const impactStats = [
  { idx: 'No. 01 — TURNS', big: 21, unit: '%', title: 'More covers per shift.', desc: 'Average turn time falls from 70 minutes to 55. One extra turn per table per peak shift.' },
  { idx: 'No. 02 — TICKETS', big: 20, unit: '%', title: 'Higher average check.', desc: 'The "Google Effect" of digital ordering. Guests browse more, consider more, add more.' },
  { idx: 'No. 03 — CHECKOUT', big: 1, unit: 'min', title: 'The check, vanished.', desc: 'The 9-to-15-minute "check dance" disappears. Guests leave when they\'re ready.', prefix: '<' },
];

function ImpactSection() {
  return (
    <section className="border-t border-border px-6 py-28 md:px-10">
      <Reveal>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">No. 03 — Impact</span>
        <h2 className="mt-3 font-display text-4xl font-light tracking-[-0.035em] md:text-6xl">
          More covers. <em className="italic text-primary">Bigger checks.</em><br />No new hardware.
        </h2>
      </Reveal>

      <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
        {impactStats.map((s, i) => (
          <Reveal key={s.idx} delay={i * 0.1} className="border-t border-border pt-8">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">{s.idx}</span>
            <div className="mt-4 font-display text-[100px] font-light leading-[0.9] tracking-[-0.045em] md:text-[120px]">
              {s.prefix && <span className="text-muted-foreground">{s.prefix}</span>}
              <em className="italic text-primary"><TickNumber to={s.big} /></em>
              <span className="ml-1 text-4xl text-muted-foreground">{s.unit}</span>
            </div>
            <h4 className="mt-4 font-display text-2xl font-light italic tracking-[-0.02em]">{s.title}</h4>
            <p className="mt-2 max-w-[340px] font-body text-sm italic text-muted-foreground">{s.desc}</p>
          </Reveal>
        ))}
      </div>

      <p className="mt-16 border-t border-border pt-8 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Sources — Sunday App · University of South Florida · Equinox Payments
      </p>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VERSUS
   ═══════════════════════════════════════════════════════════════ */

const vsRows = [
  { cat: 'Monthly software', toast: '$69 – $165 / month', walkout: '$0 forever' },
  { cat: 'Hardware cost', toast: '$627 – $1,200+', walkout: 'What you own' },
  { cat: 'Long-term contract', toast: '2-year contract', walkout: 'None' },
  { cat: 'Kitchen display', toast: 'Extra subscription', walkout: 'Included' },
  { cat: 'Payment terminals', toast: '$600 / terminal', walkout: 'The diner\u2019s phone' },
  { cat: 'Setup time', toast: 'Days + technician', walkout: '30 minutes, self-serve' },
];

function VersusSection() {
  return (
    <section className="border-t border-border bg-paper px-6 py-28 text-ink md:px-10 dark:bg-paper dark:text-ink">
      <Reveal>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-deep">No. 04 — The competition</span>
        <h2 className="mt-3 font-display text-4xl font-light tracking-[-0.035em] md:text-6xl">
          Walkout, against <em className="italic text-amber-deep">the incumbent.</em>
        </h2>
      </Reveal>

      <Reveal className="mt-12">
        <div className="border-t border-ink/10">
          <div className="grid grid-cols-3 gap-8 border-b border-ink/10 py-4 font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
            <div>Category</div><div>Toast POS</div><div className="text-amber-deep">Walkout</div>
          </div>
          {vsRows.map((r) => (
            <div key={r.cat} className="grid grid-cols-3 items-center gap-8 border-b border-ink/10 py-6">
              <span className="font-display text-xl font-light italic tracking-[-0.02em] md:text-2xl">{r.cat}</span>
              <span className="font-body text-base italic text-ink/50 line-through decoration-blood/40">{r.toast}</span>
              <span className="font-display text-xl font-light tracking-[-0.02em] md:text-2xl"><em className="italic text-amber-deep">{r.walkout}</em></span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURES
   ═══════════════════════════════════════════════════════════════ */

const featureCols = [
  {
    tag: 'No. 01 — OPERATIONS',
    title: 'The floor.',
    items: [
      'Full POS on any tablet or phone you already own.',
      'Kitchen Display System — no separate subscription.',
      'Live table management with server assignment.',
      'Digital menu with photos, categories, "popular" badges.',
      'Cash payments with receipt printing and drawer-open flow.',
      'Admin, Manager, and Server roles with separate access.',
    ],
  },
  {
    tag: 'No. 02 — PAYMENTS & REPORTING',
    title: 'The back office.',
    items: [
      'Contactless walk-out checkout. No terminal needed.',
      'Apple Pay, Google Pay, and any major card supported.',
      'Tip prompts at 18 / 20 / 22 percent, after the meal.',
      'Direct or pooled tip distribution, tracked automatically.',
      'Quarterly PA sales tax report, CSV download.',
      'Per-server tip report and full analytics dashboard.',
    ],
  },
];

function FeaturesSection() {
  return (
    <section className="border-t border-border px-6 py-28 md:px-10">
      <Reveal>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">No. 05 — Everything included</span>
        <h2 className="mt-3 font-display text-4xl font-light tracking-[-0.035em] md:text-6xl">
          From <em className="italic text-primary">day one.</em>
        </h2>
        <p className="mt-3 font-body text-lg italic text-muted-foreground">No tiered plans, no upsells, no add-ons.</p>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
        {featureCols.map((col) => (
          <Reveal key={col.tag} className="rounded-2xl border border-border bg-card p-8">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">{col.tag}</span>
            <h3 className="mt-4 font-display text-3xl font-light tracking-[-0.03em] md:text-4xl">
              The <em className="italic text-primary">{col.title.replace('The ', '')}</em>
            </h3>
            <ul className="mt-6 flex flex-col">
              {col.items.map((item, i) => (
                <li key={i} className="flex gap-3 border-t border-border py-3 font-body text-sm leading-relaxed first:border-t-0">
                  <span className="font-mono text-[10px] text-primary pt-1">{String(i + 1).padStart(2, '0')}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CLOSING
   ═══════════════════════════════════════════════════════════════ */

function Closing() {
  return (
    <section className="border-t border-border px-6 py-32 text-center md:px-10">
      <Reveal>
        <h2 className="font-display text-[clamp(64px,14vw,180px)] font-light leading-[0.9] tracking-[-0.045em]">
          Sit. Eat.<br /><em className="italic text-primary">Go.</em>
        </h2>
        <p className="mx-auto mt-10 max-w-[540px] font-body text-lg italic text-muted-foreground">
          The receipt was waiting on your phone before the door closed behind you.
        </p>
        <p className="mt-14 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Walkout — An operating system for the modern room
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/auth/register">
            <Button size="lg">Get Started Free</Button>
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer className="flex items-center justify-between border-t border-border px-6 py-8 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground md:px-10">
      <div className="flex items-center gap-2">
        <ChevronLogo className="h-4 w-6" />
        <span>Walkout, 2026 — Warminster, PA</span>
      </div>
      <div>No check · No wait · Just go</div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function HomePage() {
  return (
    <main className="mx-auto max-w-[1600px]">
      <div className="grain" />
      <Hero />
      <Ticker />
      <DinerSection />
      <MoneySection />
      <ImpactSection />
      <VersusSection />
      <FeaturesSection />
      <Closing />
      <Footer />
    </main>
  );
}
