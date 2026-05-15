import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Block clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Enforce HTTPS for 1 year (includeSubDomains)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Control referrer information
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // XSS protection (legacy browsers)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Stripe.js loads auxiliary scripts / telemetry from m.stripe.network and connects to q.stripe.com.
              // Without these, Payment Element can mount empty in the browser with CSP violations in the console.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network",
              // External <link rel="stylesheet"> (Google Fonts CSS + Stripe-injected font links) is governed by
              // style-src-elem in Chromium; without it, fonts.googleapis.com/css2 can be blocked despite style-src.
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https://images.walkoutofficial.com https://*.stripe.com",
              "media-src 'self'",
              "connect-src 'self' https://*.supabase.com https://generativelanguage.googleapis.com https://api.stripe.com https://*.stripe.com https://m.stripe.network https://*.stripe.network https://q.stripe.com https://errors.stripe.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
