export const metadata = { title: "Submission terms" };

export default function TermsPage() {
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold text-white">Submission terms</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: 2026-06-26</p>

      <div className="prose-invert mt-8 space-y-5 text-slate-300">
        <p>
          By creating an account and submitting data to SkipDB (timestamps,
          durations, IMDb IDs, votes, and related metadata), you agree to the
          following:
        </p>
        <ol className="list-decimal space-y-3 pl-5 marker:text-skip">
          <li>
            <strong className="text-white">
              You grant an open license to your contribution.
            </strong>{" "}
            All data you submit is published and openly redistributed under the{" "}
            <strong>Open Database License 1.0 (ODbL 1.0)</strong>. You also
            grant SkipDB a perpetual, worldwide, irrevocable, royalty-free right
            to publish your contribution under ODbL 1.0 or any successor open
            data license that SkipDB may adopt for future exports. If SkipDB
            changes the license, the most recent dump under the previous license
            will remain permanently available under that license, and anyone may
            fork the project from that snapshot.
          </li>
          <li>
            <strong className="text-white">Your data will be made public.</strong>{" "}
            Submissions (excluding personal account data such as your email
            address) may be served via the public API and included in public
            data dumps. Contributor identity is not part of the published
            dataset.
          </li>
          <li>
            <strong className="text-white">
              You have the right to contribute it.
            </strong>{" "}
            You confirm your contribution does not infringe anyone else&apos;s
            rights and that you are permitted to license it as described above.
          </li>
          <li>
            <strong className="text-white">The data may be used by anyone</strong>{" "}
            under ODbL 1.0 with attribution and share-alike. Any derivative
            database must also be released under ODbL 1.0 or a compatible open
            license. The dataset cannot be relicensed as proprietary.
          </li>
          <li>
            <strong className="text-white">Service providers must reciprocate.</strong>{" "}
            If you operate a public app, API, or hosted service and use SkipDB
            data to seed, validate, or augment a private skip-segment database,
            you must make your corresponding data publicly available under ODbL
            1.0 or a compatible open license. Read-only API use to display skip
            times is not affected. See the{" "}
            <a href="/license" className="text-skip hover:underline">
              full license
            </a>{" "}
            for details.
          </li>
          <li>
            <strong className="text-white">No warranty.</strong> The data is
            provided &quot;as is&quot;. SkipDB makes no guarantees about accuracy.
          </li>
          <li>
            <strong className="text-white">Moderation.</strong> Submissions may
            be reviewed, approved, rejected, edited, or removed to maintain data
            quality.
          </li>
        </ol>
        <p>
          The SkipDB application <strong className="text-white">source code</strong>{" "}
          is licensed separately under <strong>AGPL-3.0</strong>. The{" "}
          <strong className="text-white">database and API contents</strong> are
          licensed under{" "}
          <a href="/license" className="text-skip hover:underline">
            ODbL 1.0 + Service Provider Reciprocity
          </a>
          .
        </p>
      </div>
    </div>
  );
}
