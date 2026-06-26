export const metadata = { title: "Licenses" };

export default function LicensePage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold text-white">Licenses</h1>
      <p className="mt-3 text-slate-300">
        SkipDB is deliberately open on both sides — the software and the data —
        so the project can never be quietly turned proprietary.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <span className="chip bg-signal/15 text-signal-bright">Code</span>
          <h2 className="mt-3 text-xl font-semibold text-white">AGPL-3.0</h2>
          <p className="mt-2 text-sm text-slate-400">
            The application source code is licensed under the GNU Affero General
            Public License v3.0. Anyone who runs a modified version as a network
            service must make their source available — closing the SaaS
            loophole.
          </p>
        </div>
        <div className="card p-6">
          <span className="chip bg-skip/15 text-skip-bright">Data</span>
          <h2 className="mt-3 text-xl font-semibold text-white">
            CC BY-NC-SA 4.0
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            The database and API contents are licensed under Creative Commons
            Attribution-NonCommercial-ShareAlike 4.0 International, unless you
            have explicit written permission otherwise. Use it with attribution,
            non-commercially, and share alike.
          </p>
          <a
            href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
            className="mt-3 inline-block text-sm text-skip hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Read the full license →
          </a>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <h2 className="text-lg font-semibold text-white">Why two licenses?</h2>
        <p className="mt-2 text-sm text-slate-400">
          Code and data are different things. AGPL keeps the software open even
          when run as a hosted service. CC BY-NC-SA keeps the community-built
          dataset free for non-commercial use and prevents anyone — including
          future maintainers — from relicensing it as a proprietary product. The
          public{" "}
          <a href="/api/dump" className="text-skip hover:underline">
            data dump
          </a>{" "}
          makes that guarantee concrete.
        </p>
      </div>
    </div>
  );
}
