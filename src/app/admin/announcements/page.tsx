import { updateClientBannerAction } from "@/app/actions";
import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { requireRole } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminAnnouncementsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { user, supabase } = await requireRole("admin");

  const { data: banner } = await supabase
    .from("platform_messages")
    .select("id,message,updated_at")
    .eq("id", "client_order_banner")
    .maybeSingle();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Announcements" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/announcements">
      <AlertList message={message} error={error} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Publish Client Message</h2>
        <p className="mt-1 text-sm text-slate-600">This message appears above the client Create Order box.</p>
        <p className="mt-1 text-xs text-slate-500">
          Last updated: {banner?.updated_at ? new Date(banner.updated_at).toLocaleString() : "Never"}
        </p>
        <form action={updateClientBannerAction} className="mt-3 space-y-3">
          <textarea
            name="message"
            rows={5}
            placeholder="Type announcement for all approved users..."
            defaultValue={banner?.message ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              Publish Message
            </button>
            <button
              formAction={updateClientBannerAction}
              name="message"
              value=""
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100"
            >
              Clear Message
            </button>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}

