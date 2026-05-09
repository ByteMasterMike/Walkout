import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      id: 'diner',
      name: 'Diner',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const emailTrimmed = (credentials.email as string).trim().toLowerCase();
        const password = credentials.password as string;

        const diner = await prisma.diner.findUnique({
          where: { email: emailTrimmed },
        });
        if (!diner) return null;
        const valid = await bcrypt.compare(password, diner.passwordHash);
        if (!valid) return null;

        await prisma.diner.update({
          where: { id: diner.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: diner.id,
          email: diner.email,
          name: diner.name,
          restaurantId: null,
          staffId: null,
          dinerId: diner.id,
          role: 'DINER' as const,
        };
      },
    }),
    Credentials({
      id: 'restaurant',
      name: 'Restaurant / Staff',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const emailTrimmed = (credentials.email as string).trim();
        const password = credentials.password as string;

        // Try Restaurant ADMIN first (case-insensitive — legacy rows may differ in casing)
        const restaurant = await prisma.restaurant.findFirst({
          where: { email: { equals: emailTrimmed, mode: 'insensitive' } },
        });
        if (restaurant) {
          const valid = await bcrypt.compare(password, restaurant.passwordHash);
          if (!valid) return null;
          return {
            id: restaurant.id,
            email: restaurant.email,
            name: restaurant.name,
            restaurantId: restaurant.id,
            role: 'ADMIN' as const,
          };
        }

        // Try RestaurantStaff (MANAGER / STAFF)
        const staff = await prisma.restaurantStaff.findFirst({
          where: { email: { equals: emailTrimmed, mode: 'insensitive' } },
        });
        if (staff && staff.passwordHash && staff.isActive) {
          const valid = await bcrypt.compare(password, staff.passwordHash);
          if (!valid) return null;
          return {
            id: staff.id,
            email: staff.email,
            name: staff.name,
            restaurantId: staff.restaurantId,
            staffId: staff.id,
            role: staff.role as 'MANAGER' | 'STAFF',
          };
        }

        return null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          restaurantId?: string | null;
          staffId?: string | null;
          dinerId?: string | null;
          role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'DINER';
        };
        token.restaurantId = u.restaurantId ?? null;
        token.staffId = u.staffId ?? null;
        token.dinerId = u.dinerId ?? null;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.restaurantId = (token.restaurantId as string | null | undefined) ?? undefined;
        session.user.staffId = (token.staffId as string | null | undefined) ?? undefined;
        session.user.dinerId = (token.dinerId as string | null | undefined) ?? undefined;
        session.user.role = token.role as 'ADMIN' | 'MANAGER' | 'STAFF' | 'DINER';
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
  },
});
