import { updateClientBannerAction } from "@/app/actions";
import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { requireRole } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { user, supabase } = await requireRole("admin");

  const { data: banner } = await supabase
    .from("platform_messages")
    .select("id,message")
    .eq("id", "client_order_banner")
    .maybeSingle();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Settings" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/settings">
      <AlertList message={message} error={error} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">System Settings</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>SMTP credentials are configured via environment variables.</li>
          <li>Supabase Auth approval workflow is enabled via profiles.status.</li>
          <li>Low stock thresholds are managed in the Products section.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Client Dialogue Banner</h2>
        <p className="mt-1 text-sm text-slate-600">This text appears above the client Create Order section.</p>
        <p className="mt-1 text-xs text-slate-500">
          Current value: {banner?.message && banner.message.trim().length > 0 ? "Configured" : "Empty"}
        </p>
        <form action={updateClientBannerAction} className="mt-3 space-y-3">
          <textarea
            name="message"
            rows={4}
            placeholder="Type any message to show to all approved users..."
            defaultValue={banner?.message ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Save Banner
          </button>
        </form>
      </section>
    </AdminShell>
  );
}
