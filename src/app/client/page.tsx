import { Alert } from "@/components/alert";
import { ClientOrderForm } from "@/components/client-order-form";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/status-pill";
import { createOrderAction, signOutAction } from "@/app/actions";
import { BF_VALUES, GSM_VALUES, INCH_VALUES, PRODUCT_TYPES } from "@/lib/constants";
import { requireRole } from "@/lib/auth";
import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ClientOrderItem = {
  quantity_requested: number;
  quantity_approved: number;
  item_status: "pending" | "accepted" | "rejected";
  products: { gsm: number; bf: number; inch: number | null; size: number | null; type: "GY" | "NS"; price: number; discount: number } | null;
};
type ClientOrder = {
  id: string;
  gsm: number;
  bf: number;
  inch: number;
  status: "pending" | "accepted" | "rejected" | "partial" | "approved" | "partially_accepted";
  created_at: string;
  order_items: ClientOrderItem[] | null;
};

export default async function ClientPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, profile, user } = await requireRole("client");

  const { data: orders } = await supabase
    .from("orders")
    .select("id,gsm,bf,inch,status,created_at,order_items(quantity_requested,quantity_approved,item_status,products(gsm,bf,inch,size,type,price,discount))")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .returns<ClientOrder[]>();

  const { data: banner } = await supabase
    .from("platform_messages")
    .select("id,message")
    .eq("id", "client_order_banner")
    .maybeSingle();

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <Shell
      title="Client Order Portal"
      subtitle={`Logged in as ${user.email ?? "client"}`}
      actions={
        <form action={signOutAction}>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100">
            Sign out
          </button>
        </form>
      }
    >
      <div className="space-y-3">
        <Alert message={message} type="success" />
        <Alert message={error} type="error" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-semibold">Today's Market Price</p>
          <p className="mt-1 whitespace-pre-wrap">
            {banner?.message && banner.message.trim().length > 0
              ? banner.message
              : "No active message from admin."}
          </p>
        </div>
        <h2 className="text-lg font-semibold">Create Order</h2>
        <p className="mb-4 mt-1 text-sm text-slate-600">Choose product spec including type (GY/NS).</p>
        <ClientOrderForm action={createOrderAction} gsmValues={GSM_VALUES} bfValues={BF_VALUES} inchValues={INCH_VALUES} typeValues={PRODUCT_TYPES} />
        <div className="mt-4">
          <Link href="/dashboard/special-request" className="text-sm font-medium text-sky-700 hover:text-sky-600">
            Need unavailable product? Send special request
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Order History</h2>
        <div className="mt-4 space-y-4">
          {(orders ?? []).map((order) => (
            <article key={order.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Order #{order.id.slice(0, 8)}</p>
                <StatusPill status={order.status} />
              </div>
              <p className="mt-1 text-xs text-slate-600">{new Date(order.created_at).toLocaleString()}</p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="py-2">Requested Spec</th>
                      <th className="py-2">Accepted Spec</th>
                      <th className="py-2">Requested</th>
                      <th className="py-2">Approved</th>
                      <th className="py-2">Rejected</th>
                      <th className="py-2">Price</th>
                      <th className="py-2">Item Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.order_items ?? []).map((item, idx) => (
                      <tr key={`${order.id}-${idx}`} className="border-b border-slate-100">
                        <td className="py-2">{order.gsm}/{order.bf}/{order.inch}</td>
                        <td className="py-2">{item.products?.gsm}/{item.products?.bf}/{item.products?.size ?? item.products?.inch}/{item.products?.type}</td>
                        <td className="py-2">{item.quantity_requested}</td>
                        <td className="py-2">{item.quantity_approved}</td>
                        <td className="py-2">{item.quantity_requested - item.quantity_approved}</td>
                        <td className="py-2">
                          {item.products ? (item.products.price - (item.products.price * item.products.discount) / 100).toFixed(2) : "-"}
                        </td>
                        <td className="py-2"><StatusPill status={item.item_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}
