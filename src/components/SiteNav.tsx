import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { READ_ONLY } from "@/lib/read-only";
import { BASE_URL } from "@/lib/urls";

export async function SiteNav() {
  const session = await auth();
  const user = session?.user;
  const isStaff = user?.role === "admin" || user?.role === "moderator";

  return (
    <header className="sticky top-0 z-40 border-b border-black/8 bg-midnight-950/80 backdrop-blur dark:border-white/5">
      {READ_ONLY && (
        <div className="border-b border-warn/20 bg-warn/5 px-4 py-1.5 text-center text-xs text-warn">
          Read-only mirror —{" "}
          <a href={`${BASE_URL}`} className="underline hover:text-white">
            submit and vote at {BASE_URL}
          </a>
        </div>
      )}
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Brand />
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <Link href="/search" className="hover:text-white">
            Browse
          </Link>
          <Link href="/docs" className="hover:text-white">
            API
          </Link>
          <Link href="/data" className="hover:text-white">
            Data
          </Link>
          <Link href="/about" className="hover:text-white">
            About
          </Link>
          {isStaff && (
            <Link href="/admin" className="text-skip hover:text-skip-bright">
              Review
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href="https://github.com/SkipDB-TV/skipdb"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="text-slate-400 transition-colors hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
          {READ_ONLY ? null : user ? (
            <>
              <Link
                href="/account"
                className="text-sm text-slate-300 hover:text-white"
              >
                {user.name ?? "Account"}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="btn-ghost" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/auth/signin" className="btn-primary">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
