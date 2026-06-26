import { json, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";
import {
  generateApiKey,
  revokeApiKeys,
  activeKeyInfo,
} from "@/lib/api-key";

export const runtime = "nodejs";

// API keys can only be managed from a logged-in session (not via an API key).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("Authentication required.", 401);
  const info = await activeKeyInfo(session.user.id);
  return json({ key: info });
}

// Generate (or reset) the user's API key. Returns the plaintext key ONCE.
export async function POST() {
  if (READ_ONLY) return readOnlyError();
  const session = await auth();
  if (!session?.user?.id) return apiError("Authentication required.", 401);
  const { key, prefix } = await generateApiKey(session.user.id);
  return json(
    {
      key,
      prefix,
      message:
        "Here is your API key. You can reveal it again later from this page. Generating again revokes this one.",
    },
    { status: 201 },
  );
}

// Revoke the user's active key.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return apiError("Authentication required.", 401);
  await revokeApiKeys(session.user.id);
  return json({ revoked: true });
}
