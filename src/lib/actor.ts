import { auth } from "./auth";
import { userForApiKey } from "./api-key";
import type { User } from "@/db/schema";

// A discriminated union (not `user: User | {...}` with a shared `via`) so
// that `via: "api-key"` guarantees `user: User` — including its `email` field
// — at the type level. That's what lets `isAnonymousActor` below read
// `actor.user.email` directly instead of a runtime `"email" in actor.user`
// check, which would silently break if the api-key lookup ever stopped
// selecting full rows.
export type Actor =
  | { via: "api-key"; user: User }
  | { via: "session"; user: { id: string; role: string; reputation: number } };

/**
 * Resolve the acting user for a write request. Accepts either a logged-in
 * session (cookie) or an API key via `Authorization: Bearer skdb_...` or the
 * `X-API-Key` header.
 *
 * Anonymous (login-less) API keys are rejected by default — an endpoint must
 * explicitly pass `allowAnonymousKeys: true` to accept them. This keeps new
 * write endpoints registered-only unless someone deliberately opts in.
 */
export async function getActor(
  req: Request,
  opts: { allowAnonymousKeys?: boolean } = {},
): Promise<Actor | null> {
  const { allowAnonymousKeys = false } = opts;
  const authz = req.headers.get("authorization");
  const headerKey =
    req.headers.get("x-api-key") ??
    (authz?.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null);

  if (headerKey) {
    const user = await userForApiKey(headerKey);
    if (!user) return null;
    if (!user.email && !allowAnonymousKeys) return null;
    return { user, via: "api-key" };
  }

  const session = await auth();
  if (session?.user?.id) {
    return {
      user: {
        id: session.user.id,
        role: session.user.role,
        reputation: session.user.reputation,
      },
      via: "session",
    };
  }
  return null;
}

/**
 * True for the blank, login-less users created by `/api/keys/anonymous`.
 * Sessions always belong to a registered account, so only an api-key actor
 * whose user row has no email can be anonymous. Only needed by endpoints
 * that must distinguish anonymous actors after opting in via
 * `allowAnonymousKeys` (e.g. to reject registered users, not anonymous ones).
 */
export function isAnonymousActor(actor: Actor): boolean {
  return actor.via === "api-key" && !actor.user.email;
}
