import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Brand } from "./Brand";
import { READ_ONLY } from "@/lib/read-only";
import { BASE_URL } from "@/lib/urls";

export async function SiteNav() {
  const session = await auth();
  const user = session?.user;
  const isStaff = user?.role === "admin" || user?.role === "moderator";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-midnight-950/80 backdrop-blur">
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
          {isStaff && (
            <Link href="/admin" className="text-skip hover:text-skip-bright">
              Review
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
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
