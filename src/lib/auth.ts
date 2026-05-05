import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      id: 'restaurant',
      name: 'Restaurant / Staff',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Try Restaurant ADMIN first
        const restaurant = await prisma.restaurant.findUnique({ where: { email } });
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
        const staff = await prisma.restaurantStaff.findUnique({ where: { email } });
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
        token.restaurantId = (user as { restaurantId: string }).restaurantId;
        token.staffId = (user as { staffId?: string }).staffId ?? null;
        token.role = (user as { role: string }).role;
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
  pages: {
    signIn: '/auth/login',
  },
});
