import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email" };

export default function VerifyRequestPage() {
  return (
    <div className="container-page flex min-h-[80vh] items-center justify-center py-16">
        <div className="card w-full max-w-md p-8 text-center">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-skip/10 ring-1 ring-skip/20">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-skip"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m2 7 9.5 6.5a1 1 0 0 0 1 0L22 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white">Check your email</h1>
          <p className="mt-3 text-slate-400">
            A sign-in link has been sent to your email address. Click the link
            to complete sign-in — it expires in 24 hours.
          </p>

          <div className="mt-6 rounded-xl border border-white/5 bg-midnight-850 px-4 py-3 text-sm text-slate-400">
            No email? Check your spam folder, or{" "}
            <Link href="/auth/signin" className="text-skip hover:underline">
              try again
            </Link>
            .
          </div>

          <Link
            href="/"
            className="mt-6 inline-block text-sm text-slate-500 hover:text-slate-300"
          >
            ← Back to SkipDB
          </Link>
        </div>
      </div>
  );
}
