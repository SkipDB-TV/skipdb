"use client";

import { useState } from "react";

export function CredentialsForm({ callbackUrl }: { callbackUrl: string }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const endpoint = mode === "register" ? "/api/register" : "/api/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? { email, password, name: name || undefined }
            : { email, password },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          Array.isArray(data.issues)
            ? data.issues.join(", ")
            : (data.error ?? "Something went wrong"),
        );
        return;
      }
      // Full navigation so the new session cookie is picked up server-side.
      window.location.href = callbackUrl;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-midnight-850 p-1 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
          className={`rounded-lg px-3 py-1.5 transition ${
            mode === "signin"
              ? "bg-skip text-midnight-950"
              : "text-slate-300 hover:bg-white/5"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
          }}
          className={`rounded-lg px-3 py-1.5 transition ${
            mode === "register"
              ? "bg-skip text-midnight-950"
              : "text-slate-300 hover:bg-white/5"
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit} className="space-y-2">
        {mode === "register" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name (optional)"
            className="input"
            autoComplete="nickname"
          />
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input"
          autoComplete="email"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={
            mode === "register" ? "Password (min 8 characters)" : "Password"
          }
          className="input"
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
        />

        {error && (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button className="btn-primary w-full" type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
    </div>
  );
}
