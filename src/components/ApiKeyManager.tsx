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
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
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
        setRevealed(true);
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

  async function toggleReveal() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (!plaintext) {
      const res = await fetch("/api/keys/reveal");
      if (!res.ok) return;
      const data = await res.json();
      setPlaintext(data.key);
    }
    setRevealed(true);
  }

  async function copy() {
    let value = plaintext;
    if (!value) {
      const res = await fetch("/api/keys/reveal");
      if (!res.ok) return;
      value = (await res.json()).key;
      setPlaintext(value);
    }
    await navigator.clipboard.writeText(value!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
        setRevealed(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const masked = info ? `${info.keyPrefix}${"•".repeat(28)}` : "";

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

      {info ? (
        <>
          <div className="flex items-stretch gap-2">
            <code className="mono flex-1 truncate rounded-xl border border-white/10 bg-midnight-850 px-3 py-2.5 text-sm text-white">
              {revealed && plaintext ? plaintext : masked}
            </code>
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={toggleReveal}
            >
              {revealed ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={copy}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Created {new Date(info.createdAt).toLocaleDateString()}
            {info.lastUsedAt
              ? ` · last used ${new Date(info.lastUsedAt).toLocaleString()}`
              : " · never used"}
          </p>
        </>
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
