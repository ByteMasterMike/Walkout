import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      /** Present for restaurant ADMIN / staff sessions */
      restaurantId?: string | null;
      staffId?: string | null;
      /** Present when signed in via diner credentials */
      dinerId?: string | null;
      role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'DINER';
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    restaurantId?: string | null;
    staffId?: string | null;
    dinerId?: string | null;
    role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'DINER';
  }
}
