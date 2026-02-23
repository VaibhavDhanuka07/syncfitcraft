import Link from "next/link";

import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { requireRole } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const cards = [
  { key: "totalProducts", label: "Total Products" },
  { key: "totalOrders", label: "Total Orders" },
  { key: "acceptedOrders", label: "Accepted Orders" },
  { key: "rejectedOrders", label: "Rejected Orders" },
  { key: "partiallyAcceptedOrders", label: "Partially Accepted Orders" },
  { key: "lowStockProducts", label: "Low Stock Products" },
] as const;

export default async function AdminDashboard({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { user } = await requireRole("admin");
  const overview = await getAdminOverview();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Dashboard" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin">
      <AlertList message={message} error={error} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">{card.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{overview[card.key]}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/admin/orders" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Manage Orders
          </Link>
          <Link href="/admin/users" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Review Users
          </Link>
          <Link href="/admin/import-export" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Import / Export
          </Link>
        </div>
      </section>
    </AdminShell>
  );
}
