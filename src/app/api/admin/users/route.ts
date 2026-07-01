import { json, apiError } from "@/lib/api";
import { requireStaff } from "@/lib/admin";
import { listUsers } from "@/lib/user-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page")) || 1;
  const q = url.searchParams.get("q") ?? undefined;

  const result = await listUsers({ page, q });
  return json(result);
}
