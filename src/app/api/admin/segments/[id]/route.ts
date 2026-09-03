import { db } from "@/db";
import { segments } from "@/db/schema";
import { json, apiError } from "@/lib/api";
import { requireStaff } from "@/lib/admin";
import { moderateSegments } from "@/lib/moderate";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

  const { id } = await params;
  const segmentId = Number(id);
  if (!Number.isInteger(segmentId)) return apiError("Invalid id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return apiError("action must be approve or reject", 422);
  const { action, reason } = parsed.data;

  const segment = (
    await db.select().from(segments).where(eq(segments.id, segmentId))
  )[0];
  if (!segment) return apiError("Segment not found", 404);
  if (segment.status === "disabled")
    return apiError(
      "This segment belongs to a disabled user — re-enable the user instead of approving/rejecting directly.",
      409,
    );

  await moderateSegments([segment], action, staff.id, reason ?? null);

  return json({
    id: segmentId,
    status: action === "approve" ? "approved" : "rejected",
  });
}
