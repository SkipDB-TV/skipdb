import { auth } from "./auth";
import { userForApiKey } from "./api-key";
import type { User } from "@/db/schema";

export interface Actor {
  user: User | { id: string; role: string; reputation: number };
  via: "session" | "api-key";
}

/**
 * Resolve the acting user for a write request. Accepts either a logged-in
 * session (cookie) or an API key via `Authorization: Bearer skdb_...` or the
 * `X-API-Key` header.
 */
export async function getActor(req: Request): Promise<Actor | null> {
  const authz = req.headers.get("authorization");
  const headerKey =
    req.headers.get("x-api-key") ??
    (authz?.toLowerCase().startsWith("bearer ")
      ? authz.slice(7).trim()
      : null);

  if (headerKey) {
    const user = await userForApiKey(headerKey);
    if (user) return { user, via: "api-key" };
    return null;
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
