import { promises as dns } from "dns";

// Cache results briefly to avoid re-querying the same domain on repeated
// requests. Negative entries (no MX) are kept for 5 minutes; positives
// are kept for 30 minutes.
const cache = new Map<string, { ok: boolean; expiresAt: number }>();

export async function hasMxRecord(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;

  const hit = cache.get(domain);
  if (hit && Date.now() < hit.expiresAt) return hit.ok;

  try {
    const result = await Promise.race([
      dns.resolveMx(domain),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 4_000),
      ),
    ]);

    // Timeout — could be a slow DNS server; fail open so real users aren't blocked.
    if (result === "timeout") return true;

    const ok = (result as Awaited<ReturnType<typeof dns.resolveMx>>).length > 0;
    cache.set(domain, { ok, expiresAt: Date.now() + (ok ? 30 : 5) * 60_000 });
    return ok;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENOTFOUND = domain doesn't exist; ENODATA = domain has no MX records.
    // Both are definitive — cache and reject.
    if (code === "ENOTFOUND" || code === "ENODATA") {
      cache.set(domain, { ok: false, expiresAt: Date.now() + 5 * 60_000 });
      return false;
    }
    // Temporary DNS failure — fail open.
    return true;
  }
}
