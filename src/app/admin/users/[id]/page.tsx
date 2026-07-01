import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { getUserDetail } from "@/lib/user-admin";
import { AdminUserDetail } from "@/components/AdminUserDetail";
import type { SegmentTypeName } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "User detail" };

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const staff = await requireStaff();
  if (!staff) redirect("/");

  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const detail = await getUserDetail(id, { page });
  if (!detail) notFound();

  const totalPages = Math.max(1, Math.ceil(detail.submissionTotal / detail.pageSize));

  return (
    <div className="container-page py-10">
      <Link href="/admin/users" className="text-sm text-slate-400 hover:text-white">
        ← All users
      </Link>
      <div className="mt-4">
        <AdminUserDetail
          user={{
            id: detail.user.id,
            name: detail.user.name,
            email: detail.user.email,
            role: detail.user.role,
            reputation: detail.user.reputation,
            disabled: detail.user.disabled,
            createdAt: detail.user.createdAt.toISOString(),
          }}
          submissions={detail.submissions.map((s) => ({
            id: s.id,
            imdbId: s.imdbId,
            title: s.title,
            season: s.season,
            episode: s.episode,
            segmentType: s.segmentType as SegmentTypeName,
            startMs: s.startMs,
            endMs: s.endMs,
            status: s.status,
            votesUp: s.votesUp,
            votesDown: s.votesDown,
            score: s.score,
            createdAt: s.createdAt.toISOString(),
          }))}
          submissionTotal={detail.submissionTotal}
          page={page}
          totalPages={totalPages}
          isSelf={staff.id === detail.user.id}
        />
      </div>
    </div>
  );
}
