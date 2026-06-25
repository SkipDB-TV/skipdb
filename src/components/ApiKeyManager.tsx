"use client";

import { useState } from "react";

interface KeyInfo {
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function ApiKeyManager({ initial }: { initial: KeyInfo | null }) {
  const [info, setInfo] = useState<KeyInfo | null>(initial);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (
      info &&
      !confirm("Generate a new key? Your current key will stop working.")
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/keys", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPlaintext(data.key);
        setInfo({
          keyPrefix: data.prefix,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("Revoke your API key? It will stop working immediately."))
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/keys", { method: "DELETE" });
      if (res.ok) {
        setInfo(null);
        setPlaintext(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">API key</h2>
        {info && (
          <span className="chip bg-skip/15 text-skip-bright">Active</span>
        )}
      </div>
      <p className="text-sm text-slate-400">
        Use a personal API key to submit segments programmatically. Send it as{" "}
        <span className="mono">Authorization: Bearer &lt;key&gt;</span> or{" "}
        <span className="mono">X-API-Key</span>. Reading the API never needs a
        key.
      </p>

      {plaintext && (
        <div className="rounded-xl border border-skip/30 bg-skip/10 p-4">
          <p className="text-xs text-skip-bright">
            Copy this now — it won&apos;t be shown again:
          </p>
          <code className="mono mt-1 block break-all text-sm text-white">
            {plaintext}
          </code>
        </div>
      )}

      {info ? (
        <div className="text-sm text-slate-400">
          Key{" "}
          <span className="mono text-slate-200">{info.keyPrefix}…</span>
          {info.lastUsedAt
            ? ` · last used ${new Date(info.lastUsedAt).toLocaleString()}`
            : " · never used"}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No active key.</p>
      )}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={generate} disabled={busy}>
          {info ? "Reset key" : "Generate key"}
        </button>
        {info && (
          <button className="btn-danger" onClick={revoke} disabled={busy}>
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
