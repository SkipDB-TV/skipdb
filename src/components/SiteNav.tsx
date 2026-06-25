import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Brand } from "./Brand";

export async function SiteNav() {
  const session = await auth();
  const user = session?.user;
  const isStaff = user?.role === "admin" || user?.role === "moderator";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-midnight-950/80 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Brand />
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <Link href="/search" className="hover:text-white">
            Browse
          </Link>
          <Link href="/docs" className="hover:text-white">
            API
          </Link>
          <Link href="/api/dump" className="hover:text-white">
            Data dump
          </Link>
          {isStaff && (
            <Link href="/admin" className="text-skip hover:text-skip-bright">
              Review
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
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
