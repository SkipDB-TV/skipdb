import NextAuth, { type DefaultSession } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Provider } from "next-auth/providers";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { isAdminEmail } from "./admin-emails";
import { eq } from "drizzle-orm";

// Augment the session with SkipDB user fields.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "moderator" | "admin";
      reputation: number;
    } & DefaultSession["user"];
  }
}

function buildProviders(): Provider[] {
  const providers: Provider[] = [];
  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
    providers.push(
      GitHub({
        clientId: process.env.AUTH_GITHUB_ID,
        clientSecret: process.env.AUTH_GITHUB_SECRET,
      }),
    );
  }
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    );
  }
  if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
    providers.push(
      Nodemailer({
        server: process.env.EMAIL_SERVER,
        from: process.env.EMAIL_FROM,
      }),
    );
  }
  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: buildProviders(),
  session: { strategy: "database" },
  pages: { signIn: "/auth/signin" },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // these come from our extended users table via the adapter
        session.user.role = (user as { role?: typeof session.user.role }).role ?? "user";
        session.user.reputation =
          (user as { reputation?: number }).reputation ?? 0;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      // First-run convenience: promote configured emails to admin.
      if (user.email && isAdminEmail(user.email) && user.id) {
        await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, user.id));
      }
    },
  },
});
