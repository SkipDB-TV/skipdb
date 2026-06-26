import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-white/5 py-10 text-sm text-slate-400">
      <div className="container-page flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-2">
          <p className="font-semibold text-slate-200">
            ⏭ SkipDB — open skip data
          </p>
          <p>
            Crowdsourced intro, recap, outro &amp; preview timestamps. The code
            and the data are both open — forever.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Project
            </p>
            <Link href="/docs" className="block hover:text-white">
              API docs
            </Link>
            <Link
              prefetch={false}
              href="/api/dump"
              className="block hover:text-white"
            >
              Data dump
            </Link>
            <Link href="/search" className="block hover:text-white">
              Browse titles
            </Link>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Legal
            </p>
            <Link href="/terms" className="block hover:text-white">
              Submission terms
            </Link>
            <Link href="/license" className="block hover:text-white">
              Licenses
            </Link>
          </div>
        </div>
      </div>
      <div className="container-page mt-8 flex flex-col gap-1 text-xs text-slate-500">
        <p>
          Code: <span className="text-slate-300">AGPL-3.0</span> · Data:{" "}
          <span className="text-slate-300">ODbL 1.0</span> unless you have
          explicit permission.
        </p>
      </div>
    </footer>
  );
}
