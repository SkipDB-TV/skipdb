import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { listUsers } from "@/lib/user-admin";
import { AdminUsers } from "@/components/AdminUsers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const staff = await requireStaff();
  if (!staff) redirect("/");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q ?? "";

  const { users, total, pageSize } = await listUsers({ page, q });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="mt-1 text-sm text-slate-400">
            {total} user{total === 1 ? "" : "s"}, ordered by submission
            volume. Click a user to see their submissions.
          </p>
        </div>
        <Link href="/admin" className="btn-ghost text-sm">
          Review queue
        </Link>
      </div>
      <div className="mt-8">
        <AdminUsers
          initial={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
          page={page}
          totalPages={totalPages}
          q={q}
        />
      </div>
    </div>
  );
}
