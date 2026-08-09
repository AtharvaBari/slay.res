import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { upsertUser } from "./db";

/** Is Google OAuth configured? UI uses this to explain how to enable sign-in. */
export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      // Persist the user record on first sign-in (and refresh name/avatar).
      if (user?.email) {
        try {
          upsertUser({ email: user.email, name: user.name ?? "", image: user.image ?? "" });
        } catch {
          /* db unavailable — sign-in should still succeed */
        }
      }
      return true;
    },
  },
};
