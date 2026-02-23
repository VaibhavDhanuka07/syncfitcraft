import {
  addOrUpdateProductAction,
  deleteProductAction,
  restockProductAction,
  updateProductAdminAction,
} from "@/app/actions";
import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { BF_VALUES, GSM_VALUES, INCH_VALUES, PRODUCT_TYPES } from "@/lib/constants";
import { requireRole } from "@/lib/auth";
import type { Product } from "@/lib/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, user } = await requireRole("admin");

  const { data: products } = await supabase
    .from("products")
    .select("id,gsm,bf,inch,type,stock,available_reels,price,discount,is_active,low_stock_threshold,image_url,created_at")
    .order("created_at", { ascending: false })
    .returns<Product[]>();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Products" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/products">
      <AlertList message={message} error={error} />
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Add Product</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600">Unique by GSM + BF + Inch + Type</p>
          <form action={addOrUpdateProductAction} className="grid gap-3 sm:grid-cols-2">
            <select name="gsm" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">GSM</option>{GSM_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            <select name="bf" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">BF</option>{BF_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            <select name="inch" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Inch</option>{INCH_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            <select name="type" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Type</option>{PRODUCT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            <input type="number" name="stock" min={0} required placeholder="Stock" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="number" name="price" step="0.01" min={0} required placeholder="Price" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="number" name="discount" step="0.01" min={0} defaultValue={0} placeholder="Discount" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="number" name="low_stock_threshold" min={0} defaultValue={10} placeholder="Low stock threshold" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="url" name="image_url" placeholder="Image URL" className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select name="is_active" defaultValue="true" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="true">Active</option><option value="false">Disabled</option></select>
            <button className="sm:col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Save Product</button>
          </form>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Product Controls</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="pb-2">Spec</th><th className="pb-2">Stock</th><th className="pb-2">Price</th><th className="pb-2">Discount</th><th className="pb-2">Low Threshold</th><th className="pb-2">Active</th><th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).map((product) => (
                <tr key={product.id} className="border-b border-slate-100 align-top">
                  <td className="py-3">{product.gsm}/{product.bf}/{product.inch}/{product.type}</td>
                  <td className="py-3 font-semibold">{product.stock}</td>
                  <td className="py-3">{product.price}</td>
                  <td className="py-3">{product.discount}</td>
                  <td className="py-3">{product.low_stock_threshold}</td>
                  <td className="py-3">{product.is_active ? "Yes" : "No"}</td>
                  <td className="py-3 space-y-2">
                    <form action={updateProductAdminAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="product_id" value={product.id} />
                      <input type="number" name="stock" min={0} defaultValue={product.stock} className="w-20 rounded border border-slate-300 px-1 py-1" />
                      <input type="number" name="price" step="0.01" min={0} defaultValue={product.price} className="w-20 rounded border border-slate-300 px-1 py-1" />
                      <input type="number" name="discount" step="0.01" min={0} defaultValue={product.discount} className="w-20 rounded border border-slate-300 px-1 py-1" />
                      <input type="number" name="low_stock_threshold" min={0} defaultValue={product.low_stock_threshold} className="w-20 rounded border border-slate-300 px-1 py-1" />
                      <select name="is_active" defaultValue={String(product.is_active)} className="rounded border border-slate-300 px-1 py-1"><option value="true">Active</option><option value="false">Disabled</option></select>
                      <button className="rounded-lg bg-slate-200 px-3 py-1.5 font-medium hover:bg-slate-300">Update</button>
                    </form>
                    <form action={restockProductAction} className="flex gap-2">
                      <input type="hidden" name="product_id" value={product.id} />
                      <input type="number" name="increment_by" min={1} required placeholder="+ stock" className="w-20 rounded border border-slate-300 px-1 py-1" />
                      <button className="rounded-lg bg-emerald-100 px-3 py-1.5 font-medium hover:bg-emerald-200">Restock</button>
                    </form>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="product_id" value={product.id} />
                      <button className="rounded-lg bg-rose-100 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-200">Delete</button>
                    </form>
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
