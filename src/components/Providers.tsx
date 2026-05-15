'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import StaffSessionServiceRequestChime from '@/components/StaffSessionServiceRequestChime';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <StaffSessionServiceRequestChime />
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}
