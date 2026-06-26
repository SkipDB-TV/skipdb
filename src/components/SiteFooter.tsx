import Link from "next/link";
import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-white/5 py-10 text-sm text-slate-400">
      <div className="container-page flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <Link href="/" className="group inline-flex items-center gap-2">
            <Image
              src="/skipdb_256.png"
              alt="SkipDB"
              width={32}
              height={32}
              className="rounded-lg shadow-glow transition group-hover:scale-105"
            />
            <span className="text-xl font-bold tracking-tight text-slate-200">
              Skip<span className="text-skip">DB</span>
            </span>
          </Link>
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
            <Link href="/data" className="block hover:text-white">
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
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Contact
            </p>
            <a
              href="mailto:hello@skipdb.tv"
              className="block hover:text-white"
            >
              hello@skipdb.tv
            </a>
          </div>
        </div>
      </div>
      <div className="container-page mt-8 flex flex-col gap-4 text-xs text-slate-500">
        <p>
          Code: <span className="text-slate-300">AGPL-3.0</span> · Data:{" "}
          <a href="/license" className="text-slate-300 hover:underline">
            ODbL 1.0 + reciprocity
          </a>{" "}
          unless you have explicit permission.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            className="opacity-70 transition hover:opacity-100"
          >
            <img src="/tmdb-logo.svg" alt="TMDB" width={64} height={14} />
          </a>
          <p>
            This website uses TMDB and the TMDB APIs but is not endorsed,
            certified, or otherwise approved by TMDB.
          </p>
        </div>
      </div>
    </footer>
  );
}
