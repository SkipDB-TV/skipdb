import { json, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { revealApiKey } from "@/lib/api-key";

export const runtime = "nodejs";

// Reveal the plaintext of the current user's active API key. Session only.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("Authentication required.", 401);
  const key = await revealApiKey(session.user.id);
  if (!key) return apiError("No active API key to reveal.", 404);
  return json({ key });
}
