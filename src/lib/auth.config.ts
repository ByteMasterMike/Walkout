import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.restaurantId = (user as any).restaurantId;
        token.staffId = (user as any).staffId ?? null;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.restaurantId = token.restaurantId as string;
        session.user.staffId = token.staffId as string | null;
        session.user.role = token.role as 'ADMIN' | 'MANAGER' | 'STAFF';
      }
      return session;
    },
  },
  providers: [],
};