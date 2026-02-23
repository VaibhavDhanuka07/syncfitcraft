import { updateSpecialRequestStatusAction } from "@/app/actions";
import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { requireRole } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type SpecialRequestAdminRow = {
  id: string;
  message: string;
  reply: string | null;
  status: "new" | "seen" | "responded";
  created_at: string;
  profiles: {
    firm_name: string;
    full_name: string;
    email: string;
  } | null;
};

export default async function AdminMessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, user } = await requireRole("admin");

  const { data: rows } = await supabase
    .from("special_requests")
    .select("id,message,reply,status,created_at,profiles!special_requests_user_id_fkey(firm_name,full_name,email)")
    .order("created_at", { ascending: false })
    .returns<SpecialRequestAdminRow[]>();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Messages" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/messages">
      <AlertList message={message} error={error} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Special Product Requests</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="pb-2">Firm</th>
                <th className="pb-2">User</th>
                <th className="pb-2">Message</th>
                <th className="pb-2">Date</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 align-top">
                  <td className="py-3">{entry.profiles?.firm_name ?? "-"}</td>
                  <td className="py-3">
                    <p>{entry.profiles?.full_name ?? "-"}</p>
                    <p className="text-xs text-slate-500">{entry.profiles?.email ?? "-"}</p>
                  </td>
                  <td className="py-3">{entry.message}</td>
                  <td className="py-3">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="py-3">{entry.status}</td>
                  <td className="py-3">
                    <div className="space-y-2">
                      {entry.status === "new" ? (
                        <form action={updateSpecialRequestStatusAction}>
                          <input type="hidden" name="request_id" value={entry.id} />
                          <input type="hidden" name="status" value="seen" />
                          <button className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600">
                            Mark Seen
                          </button>
                        </form>
                      ) : null}
                      {entry.status !== "responded" ? (
                        <form action={updateSpecialRequestStatusAction} className="space-y-2">
                          <input type="hidden" name="request_id" value={entry.id} />
                          <input type="hidden" name="status" value="responded" />
                          <textarea
                            name="reply"
                            rows={2}
                            placeholder="Reply (optional)"
                            className="w-56 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          />
                          <button className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                            Mark Responded
                          </button>
                        </form>
                      ) : (
                        <p className="text-xs text-slate-600">Reply: {entry.reply ?? "-"}</p>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

