import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { ImportStockForm } from "@/components/import-stock-form";
import { requireRole } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminImportExportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { user } = await requireRole("admin");

  const range = typeof params.range === "string" ? params.range : "overall";
  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Import / Export" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/import-export">
      <AlertList message={message} error={error} />

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Export Reports</h2>
          <form action="/admin/import-export" className="mt-3 flex items-end gap-3 text-sm">
            <label className="grid gap-1">
              Range
              <select name="range" defaultValue={range} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
                <option value="3months">3 Months</option>
                <option value="6months">6 Months</option>
                <option value="1year">1 Year</option>
                <option value="financial_year">Financial Year</option>
                <option value="total">Total</option>
              </select>
            </label>
            <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700">Apply</button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <a className="rounded-lg border px-3 py-1.5 hover:bg-slate-100" href={`/api/admin/export?range=${range}&type=csv`}>Download CSV</a>
            <a className="rounded-lg border px-3 py-1.5 hover:bg-slate-100" href={`/api/admin/export?range=${range}&type=xlsx`}>Download XLSX</a>
            <a className="rounded-lg border px-3 py-1.5 hover:bg-slate-100" href={`/api/admin/export?range=${range}&type=pdf`}>Download PDF</a>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Import CSV / XLSX</h2>
          <ImportStockForm />
        </article>
      </section>
    </AdminShell>
  );
}
