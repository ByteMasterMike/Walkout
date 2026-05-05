import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      restaurantId: string;
      staffId: string | null;
      role: 'ADMIN' | 'MANAGER' | 'STAFF';
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    restaurantId: string;
    staffId: string | null;
    role: 'ADMIN' | 'MANAGER' | 'STAFF';
  }
}
