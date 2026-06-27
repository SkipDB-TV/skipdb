import NextAuth, { type DefaultSession } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { Provider } from "next-auth/providers";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { isAdminEmail } from "./admin-emails";
import { hasMxRecord } from "./email-validation";
import { rateLimit } from "./rate-limit";
import { eq } from "drizzle-orm";

/**
 * Parse an SMTP URL into a nodemailer options object without using the WHATWG
 * URL parser. new URL() and legacy url.parse() both break when passwords
 * contain unencoded special characters (@, /, :) — common in AWS SES SMTP
 * credentials. This parser uses lastIndexOf('@') to find the auth/host
 * boundary, so @ in the password is handled correctly; / and : in the
 * password are fine because we split credentials on the *first* colon only.
 */
function parseSmtpUrl(server: string): SMTPTransport.Options {
  const protoMatch = server.match(/^(smtps?):\/\//i);
  if (!protoMatch) return {};

  const secure = protoMatch[1].toLowerCase() === "smtps";
  const rest = server.slice(protoMatch[0].length); // everything after "smtp://"

  const atIdx = rest.lastIndexOf("@");
  let auth: SMTPTransport.Options["auth"];
  let hostPart: string;

  if (atIdx !== -1) {
    const creds = rest.slice(0, atIdx);
    hostPart = rest.slice(atIdx + 1);
    const colonIdx = creds.indexOf(":");
    const tryDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
    auth = colonIdx !== -1
      ? { user: tryDecode(creds.slice(0, colonIdx)), pass: tryDecode(creds.slice(colonIdx + 1)) }
      : { user: tryDecode(creds), pass: "" };
  } else {
    hostPart = rest;
  }

  const portMatch = hostPart.match(/:(\d+)$/);
  const host = portMatch ? hostPart.slice(0, -portMatch[0].length) : hostPart;
  const port = portMatch ? Number(portMatch[1]) : secure ? 465 : 587;

  return { host, port, secure, ...(auth ? { auth } : {}) };
}

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
        async sendVerificationRequest({ identifier: email, url }) {
          // Reject addresses whose domain has no MX records.
          if (!(await hasMxRecord(email))) {
            throw new Error(
              "That email address doesn't appear to be valid. Please check it and try again.",
            );
          }

          // Per-email rate limit: 3 magic-link requests per hour.
          const rl = rateLimit(`magic-link:${email.toLowerCase()}`, 3, 60 * 60_000);
          if (!rl.ok) {
            throw new Error(
              "Too many sign-in requests for this email. Please wait before trying again.",
            );
          }

          const transport = nodemailer.createTransport(
            parseSmtpUrl(process.env.EMAIL_SERVER!),
          );
          const host = new URL(url).hostname;
          await transport.sendMail({
            to: email,
            from: process.env.EMAIL_FROM,
            subject: `Sign in to SkipDB`,
            text: [
              `Sign in to SkipDB`,
              ``,
              `Click the link below to sign in. It expires in 24 hours.`,
              ``,
              url,
              ``,
              `If you didn't request this, you can safely ignore this email.`,
              ``,
              `— SkipDB (${host})`,
            ].join("\n"),
            html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#06080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#cbd5e1">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#06080f;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">

        <!-- Logo -->
        <tr><td style="padding-bottom:32px;text-align:center">
          <span style="font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.5px">
            Skip<span style="color:#22d3ee">DB</span>
          </span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#0d1117;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:40px 32px">

          <!-- Icon -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <div style="display:inline-block;background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.15);border-radius:12px;padding:14px">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m2 7 9.5 6.5a1 1 0 0 0 1 0L22 7"/>
                </svg>
              </div>
            </td></tr>
          </table>

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;text-align:center">Sign in to SkipDB</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#94a3b8;text-align:center;line-height:1.6">
            Click the button below to sign in. This link expires in&nbsp;24&nbsp;hours.
          </p>

          <!-- CTA button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr><td align="center">
              <a href="${url}" style="display:inline-block;background:#22d3ee;color:#06080f;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:10px;letter-spacing:-0.1px">
                Sign in to SkipDB
              </a>
            </td></tr>
          </table>

          <!-- Fallback URL -->
          <p style="margin:0 0 4px;font-size:12px;color:#475569;text-align:center">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:11px;color:#334155;text-align:center;word-break:break-all">${url}</p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;font-size:12px;color:#334155;line-height:1.6">
          If you didn't request this email you can safely ignore it.<br>
          <span style="color:#1e293b">${host}</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
          });
        },
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
  pages: { signIn: "/auth/signin", verifyRequest: "/auth/verify-request" },
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
