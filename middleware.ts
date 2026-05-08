import { proxy } from './src/proxy';

export const middleware = proxy;

/** Matcher must live in this file — Next.js cannot parse `config` re-exported from another module. */
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/restaurant/:path*',
    '/tab/:path*',
    '/api/sessions/:path*',
    '/join/:path*',
    '/api/join/:path*',
  ],
};
