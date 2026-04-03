import { acceptOrderWithSpecChangesAction, processFullOrderAction } from "@/app/actions";
import { AlertList } from "@/components/alert-list";
import { AdminShell } from "@/components/admin-shell";
import { OrderExportLinks } from "@/components/order-export-links";
import { StatusPill } from "@/components/status-pill";
import { requireRole } from "@/lib/auth";
import { isOrderExportable } from "@/lib/order-export";
import type { ProductType } from "@/lib/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type AdminOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  requested_gsm: number;
  requested_bf: number;
  requested_inch: number;
  requested_type: ProductType;
  quantity_requested: number;
  quantity_approved: number;
  item_status: "pending" | "accepted" | "rejected";
  products: { gsm: number; bf: number; inch: number | null; size: number | null; type: ProductType; price: number; discount: number } | null;
};
type AdminOrderRow = {
  id: string;
  user_id: string;
  gsm: number;
  bf: number;
  inch: number;
  status: "pending" | "accepted" | "rejected" | "partial" | "approved" | "partially_accepted";
  created_at: string;
};
type AdminOrderProfile = {
  id: string;
  name: string | null;
  email: string;
};
type AdminProductRow = {
  id: string;
  gsm: number;
  bf: number;
  inch: number | null;
  size: number | null;
  type: ProductType;
  price: number;
  discount: number;
};

function getPage(params: Record<string, string | string[] | undefined>) {
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, user } = await requireRole("admin");

  const page = getPage(params);
  const pageSize = 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: orders, count, error: ordersError } = await supabase
    .from("orders")
    .select("id,user_id,gsm,bf,inch,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<AdminOrderRow[]>();

  const message = typeof params.message === "string" ? params.message : undefined;
  const queryError = ordersError?.message;
  const error = typeof params.error === "string" ? params.error : queryError;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const orderUserIds = Array.from(new Set((orders ?? []).map((order) => order.user_id)));
  const orderIds = (orders ?? []).map((order) => order.id);

  const { data: profiles } = orderUserIds.length
    ? await supabase.from("profiles").select("id,name,email").in("id", orderUserIds).returns<AdminOrderProfile[]>()
    : { data: [] as AdminOrderProfile[] };

  const { data: orderItems } = orderIds.length
    ? await supabase
        .from("order_items")
        .select("id,order_id,product_id,requested_gsm,requested_bf,requested_inch,requested_type,quantity_requested,quantity_approved,item_status")
        .in("order_id", orderIds)
        .returns<Omit<AdminOrderItemRow, "products">[]>()
    : { data: [] as Omit<AdminOrderItemRow, "products">[] };

  const productIds = Array.from(new Set((orderItems ?? []).map((item) => item.product_id)));
  const { data: products } = productIds.length
    ? await supabase
        .from("products")
        .select("id,gsm,bf,inch,size,type,price,discount")
        .in("id", productIds)
        .returns<AdminProductRow[]>()
    : { data: [] as AdminProductRow[] };

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const itemsByOrderId = new Map<string, AdminOrderItemRow[]>();

  for (const item of orderItems ?? []) {
    const mapped: AdminOrderItemRow = {
      ...item,
      products: productById.get(item.product_id) ?? null,
    };
    const bucket = itemsByOrderId.get(item.order_id) ?? [];
    bucket.push(mapped);
    itemsByOrderId.set(item.order_id, bucket);
  }

  return (
    <AdminShell title="Orders" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/orders">
      <AlertList message={message} error={error} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Partial Acceptance Workflow</h2>
        <div className="mt-4 space-y-4">
          {(orders ?? []).map((order) => {
            const orderItems = itemsByOrderId.get(order.id) ?? [];
            const canExport = isOrderExportable(
              order.status,
              orderItems.map((item) => ({
                itemStatus: item.item_status,
                approvedQuantity: item.quantity_approved,
              })),
            );

            return (
              <article key={order.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Order #{order.id.slice(0, 8)}</p>
                    <p className="text-xs text-slate-600">
                      {profileById.get(order.user_id)?.name ?? "Unknown"} ({profileById.get(order.user_id)?.email ?? order.user_id})
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <StatusPill status={order.status} />
                  </div>
                </div>

                {canExport ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Order Downloads</p>
                      <p className="mt-1 text-sm text-slate-700">Export the accepted order description for admin review, sharing, or billing support.</p>
                    </div>
                    <OrderExportLinks orderId={order.id} canExport={canExport} />
                  </div>
                ) : null}

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[940px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2">Requested Spec</th>
                        <th className="py-2">Accepted Spec</th>
                        <th className="py-2">Requested</th>
                        <th className="py-2">Approved</th>
                        <th className="py-2">Rejected</th>
                        <th className="py-2">Price</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="py-2">{item.requested_gsm}/{item.requested_bf}/{item.requested_inch}/{item.requested_type}</td>
                          <td className="py-2">{item.products?.gsm}/{item.products?.bf}/{item.products?.size ?? item.products?.inch}/{item.products?.type}</td>
                          <td className="py-2">{item.quantity_requested}</td>
                          <td className="py-2">{item.quantity_approved}</td>
                          <td className="py-2">{item.quantity_requested - item.quantity_approved}</td>
                          <td className="py-2">{item.products?.price ?? 0}</td>
                          <td className="py-2"><StatusPill status={item.item_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {order.status === "pending" ? (
                  <div className="mt-3 flex gap-2">
                    <details className="rounded-lg border border-emerald-300 p-2">
                      <summary className="cursor-pointer rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                        Accept
                      </summary>
                      <form action={acceptOrderWithSpecChangesAction} className="mt-3 space-y-3">
                        <input type="hidden" name="order_id" value={order.id} />
                        {orderItems
                          .filter((item) => item.item_status === "pending")
                          .map((item) => (
                          <div key={`accept-${item.id}`} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-6">
                            <input type="hidden" name="order_item_id" value={item.id} />
                            <input
                              type="number"
                              name="gsm"
                              defaultValue={item.requested_gsm}
                              min={60}
                              max={400}
                              required
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            />
                            <input
                              type="number"
                              name="bf"
                              defaultValue={item.requested_bf}
                              min={16}
                              max={40}
                              required
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            />
                            <input
                              type="number"
                              name="inch"
                              defaultValue={item.requested_inch}
                              min={10}
                              max={60}
                              required
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            />
                            <select
                              name="type"
                              defaultValue={item.requested_type}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            >
                              <option value="GY">GY</option>
                              <option value="NS">NS</option>
                            </select>
                            <input
                              type="number"
                              name="approved_qty"
                              defaultValue={item.quantity_requested}
                              min={1}
                              max={item.quantity_requested}
                              required
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            />
                            <span className="text-xs text-slate-600">Req: {item.quantity_requested}</span>
                          </div>
                        ))}
                        <button className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                          Confirm Accept
                        </button>
                      </form>
                    </details>
                    <form action={processFullOrderAction}>
                      <input type="hidden" name="order_id" value={order.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600">Reject Full Order</button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between text-sm">
          <a className={`rounded-lg border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-slate-100"}`} href={`/admin/orders?page=${page - 1}`}>Previous</a>
          <span>Page {page} of {totalPages}</span>
          <a className={`rounded-lg border px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-slate-100"}`} href={`/admin/orders?page=${page + 1}`}>Next</a>
        </div>
      </section>
    </AdminShell>
  );
}
