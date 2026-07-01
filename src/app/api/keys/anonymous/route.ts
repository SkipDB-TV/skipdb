import { json, apiError } from "@/lib/api";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";
import { generateAnonymousApiKey, revokeApiKeys } from "@/lib/api-key";
import { getActor, isAnonymousActor } from "@/lib/actor";
import { rateLimit, rateLimitHeaders, clientIp } from "@/lib/rate-limit";
import { config } from "@/lib/config";

export const runtime = "nodejs";

// Mint a brand-new anonymous user + API key — no sign-up required. Rate-limited
// per IP (much tighter than a normal key reset) since every call creates a
// fresh user row.
export async function POST(req: Request) {
  if (READ_ONLY) return readOnlyError();

  const rl = rateLimit(
    `anon-key:${clientIp(req)}`,
    config.limits.anonymousKeysPerHour,
    60 * 60_000,
  );
  if (!rl.ok)
    return apiError("Rate limit exceeded. Try again later.", 429, {
      retry_after_s: Math.ceil((rl.resetAt - Date.now()) / 1000),
    });

  const { key, prefix } = await generateAnonymousApiKey();
  return json(
    {
      key,
      prefix,
      message:
        "Here is your anonymous API key. Save it now — there's no account to sign into and recover it from. Losing it means generating a new one.",
    },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
}

// Revoke an anonymous key using the key itself (there's no session to revoke
// it from). Registered accounts must still manage their key from /account.
export async function DELETE(req: Request) {
  if (READ_ONLY) return readOnlyError();

  const actor = await getActor(req, { allowAnonymousKeys: true });
  if (!actor || actor.via !== "api-key")
    return apiError(
      "Provide the key to revoke via the Authorization or X-API-Key header.",
      401,
    );
  if (!isAnonymousActor(actor))
    return apiError(
      "This key belongs to a registered account — manage it from your account page instead.",
      403,
    );

  await revokeApiKeys(actor.user.id);
  return json({ revoked: true });
}
