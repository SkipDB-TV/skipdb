import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { BulkSubmit } from "@/components/BulkSubmit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bulk submit" };

export default async function BulkSubmitPage() {
  const staff = await requireStaff();
  if (!staff) redirect("/");

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Bulk submit</h1>
          <p className="mt-1 text-sm text-slate-400">
            Submit the same segment across multiple episodes at once. All
            submissions are auto-approved as staff.
          </p>
        </div>
      </div>
      <div className="mt-8">
        <BulkSubmit />
      </div>
    </div>
  );
}
