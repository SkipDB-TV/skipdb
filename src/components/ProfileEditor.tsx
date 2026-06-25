"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileEditor({
  initialName,
  initialEmail,
  social,
}: {
  initialName: string;
  initialEmail: string;
  social: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({
          ok: false,
          text: Array.isArray(data.issues)
            ? data.issues.join(", ")
            : (data.error ?? "Could not save"),
        });
      } else {
        setMsg({ ok: true, text: "Profile updated." });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold text-white">Profile</h2>

      {social ? (
        <p className="text-sm text-slate-400">
          Your name and email are managed by your social login provider, so they
          can&apos;t be edited here.
        </p>
      ) : null}

      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Display name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={social}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Email</span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={social}
            required
          />
        </label>

        {msg && (
          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              msg.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-rose-300"
            }`}
          >
            {msg.text}
          </p>
        )}

        {!social && (
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
      </form>
    </div>
  );
}
