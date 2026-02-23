import { approveUserAction, rejectUserAction } from "@/app/actions";
import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { StatusPill } from "@/components/status-pill";
import { requireRole } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type AdminUserRow = {
  id: string;
  firm_name: string | null;
  proprietor_name: string | null;
  gst_number: string | null;
  phone1: string | null;
  status: "pending" | "approved" | "rejected";
  approval_status: "pending" | "approved" | "rejected" | null;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, user } = await requireRole("admin");

  const { data: users } = await supabase
    .from("profiles")
    .select("id,firm_name,proprietor_name,gst_number,phone1,status,approval_status")
    .order("created_at", { ascending: false })
    .returns<AdminUserRow[]>();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Users" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/users">
      <AlertList message={message} error={error} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Registration Approval</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="pb-2">Firm</th>
                <th className="pb-2">Proprietor</th>
                <th className="pb-2">GST</th>
                <th className="pb-2">Phone</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((entry) => {
                const approval = entry.approval_status ?? entry.status;
                return (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="py-3">{entry.firm_name ?? "-"}</td>
                    <td className="py-3">{entry.proprietor_name ?? "-"}</td>
                    <td className="py-3">{entry.gst_number || "-"}</td>
                    <td className="py-3">{entry.phone1 ?? "-"}</td>
                    <td className="py-3"><StatusPill status={approval} /></td>
                    <td className="py-3">
                      {approval === "pending" ? (
                        <div className="flex gap-2">
                          <form action={approveUserAction}>
                            <input type="hidden" name="user_id" value={entry.id} />
                            <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Approve</button>
                          </form>
                          <form action={rejectUserAction}>
                            <input type="hidden" name="user_id" value={entry.id} />
                            <button className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500">Reject</button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">No action</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
