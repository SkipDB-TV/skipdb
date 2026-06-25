import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { Brand } from "@/components/Brand";
import { CredentialsForm } from "@/components/CredentialsForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/account");
  const { error, sent } = await searchParams;

  const hasGitHub = Boolean(
    process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
  );
  const hasGoogle = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );
  const hasEmail = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
  const hasOtherMethods = hasGitHub || hasGoogle || hasEmail;

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand size="lg" />
          <p className="text-sm text-slate-400">
            Sign in to contribute timestamps and manage your API key.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2 text-sm text-rose-300">
            Sign-in failed ({error}). Please try again.
          </p>
        )}
        {sent && (
          <p className="mb-4 rounded-xl bg-ok/10 px-4 py-2 text-sm text-ok">
            Check your email for a sign-in link.
          </p>
        )}

        {/* Email + password — always available */}
        <CredentialsForm callbackUrl="/account" />

        {hasOtherMethods && (
          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-white/10" />
            or continue with
            <span className="h-px flex-1 bg-white/10" />
          </div>
        )}

        <div className="space-y-3">
          {hasGitHub && (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/account" });
              }}
            >
              <button className="btn-ghost w-full" type="submit">
                Continue with GitHub
              </button>
            </form>
          )}
          {hasGoogle && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/account" });
              }}
            >
              <button className="btn-ghost w-full" type="submit">
                Continue with Google
              </button>
            </form>
          )}
          {hasEmail && (
            <form
              action={async (formData: FormData) => {
                "use server";
                await signIn("nodemailer", {
                  email: String(formData.get("email")),
                  redirectTo: "/account",
                });
              }}
              className="space-y-2 pt-1"
            >
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="input"
              />
              <button className="btn-primary w-full" type="submit">
                Email me a sign-in link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
