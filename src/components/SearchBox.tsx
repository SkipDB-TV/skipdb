"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBox({
  autoFocus = false,
  initial = "",
}: {
  autoFocus?: boolean;
  initial?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        // IMDb id goes straight to the title page.
        if (/^tt\d{6,10}$/i.test(v)) router.push(`/title/${v.toLowerCase()}`);
        else router.push(`/search?q=${encodeURIComponent(v)}`);
      }}
      className="flex w-full gap-2"
    >
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a movie or show, or paste an IMDb id (tt0903747)…"
        className="input"
        aria-label="Search titles"
      />
      <button className="btn-primary shrink-0" type="submit">
        Search
      </button>
    </form>
  );
}
