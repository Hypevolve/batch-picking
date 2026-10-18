import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe part of the Auth.js config, shared by the middleware and the full
 * config in `auth.ts`. It must not import anything that needs Node.js APIs
 * (password hashing, database clients): the middleware runs on the Edge runtime.
 */
export const authConfig = {
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role as typeof token.role;
        token.id = user.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
