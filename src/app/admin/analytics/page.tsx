import { AlertList } from "@/components/alert-list";
import { AnalyticsChartsPanel } from "@/components/admin/analytics-charts-panel";
import { AdminShell } from "@/components/admin-shell";
import { requireRole } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ItemAnalyticsRow = {
  quantity_approved: number;
  item_status: "pending" | "accepted" | "rejected";
  created_at: string;
  products: {
    id: string;
    gsm: number;
    bf: number;
    inch: number;
    type: "GY" | "NS";
    stock: number;
    low_stock_threshold: number;
    price: number;
    discount: number;
  } | null;
};
type OrderAnalyticsRow = { id: string; status: string; created_at: string };
type OrderUserRow = { id: string; user_id: string };
type ProfileLite = { id: string; name: string | null; email: string };

function parseDate(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value) return undefined;
  return value;
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, user } = await requireRole("admin");

  const startDate = parseDate(params.start_date);
  const endDate = parseDate(params.end_date);

  let ordersQuery = supabase.from("orders").select("id,status,created_at");
  if (startDate) ordersQuery = ordersQuery.gte("created_at", `${startDate}T00:00:00`);
  if (endDate) ordersQuery = ordersQuery.lte("created_at", `${endDate}T23:59:59`);

  const { data: orders } = await ordersQuery.returns<OrderAnalyticsRow[]>();
  let orderUsersQuery = supabase.from("orders").select("id,user_id");
  if (startDate) orderUsersQuery = orderUsersQuery.gte("created_at", `${startDate}T00:00:00`);
  if (endDate) orderUsersQuery = orderUsersQuery.lte("created_at", `${endDate}T23:59:59`);
  const { data: orderUsers } = await orderUsersQuery.returns<OrderUserRow[]>();

  let itemQuery = supabase
    .from("order_items")
    .select("quantity_approved,item_status,created_at,products(id,gsm,bf,inch,type,stock,low_stock_threshold,price,discount)");

  if (startDate) itemQuery = itemQuery.gte("created_at", `${startDate}T00:00:00`);
  if (endDate) itemQuery = itemQuery.lte("created_at", `${endDate}T23:59:59`);

  const { data: itemRows } = await itemQuery.returns<ItemAnalyticsRow[]>();

  const totalOrders = orders?.length ?? 0;
  const acceptedOrders = (orders ?? []).filter((o) => ["accepted", "approved"].includes(o.status)).length;
  const rejectedOrders = (orders ?? []).filter((o) => o.status === "rejected").length;
  const partialOrders = (orders ?? []).filter((o) => ["partial", "partially_accepted"].includes(o.status)).length;

  const acceptedItems = (itemRows ?? []).filter((row) => row.item_status === "accepted" && row.products);

  const revenue = acceptedItems.reduce((sum, row) => {
    const price = row.products?.price ?? 0;
    const discount = row.products?.discount ?? 0;
    const effectivePrice = price - (price * discount) / 100;
    return sum + row.quantity_approved * effectivePrice;
  }, 0);

  const productSales = new Map<string, { label: string; sold: number }>();
  const productOrderCounts = new Map<string, { label: string; count: number }>();
  for (const row of acceptedItems) {
    if (!row.products) continue;
    const key = row.products.id;
    const label = `${row.products.gsm}/${row.products.bf}/${row.products.inch}/${row.products.type}`;
    const existing = productSales.get(key) ?? { label, sold: 0 };
    existing.sold += row.quantity_approved;
    productSales.set(key, existing);
  }
  for (const row of itemRows ?? []) {
    if (!row.products) continue;
    const key = row.products.id;
    const label = `${row.products.gsm}/${row.products.bf}/${row.products.inch}/${row.products.type}`;
    const existing = productOrderCounts.get(key) ?? { label, count: 0 };
    existing.count += 1;
    productOrderCounts.set(key, existing);
  }

  const mostSoldProduct = Array.from(productSales.values()).sort((a, b) => b.sold - a.sold)[0];
  const mostOrderedProduct = Array.from(productOrderCounts.values()).sort((a, b) => b.count - a.count)[0];

  const userOrderCounts = new Map<string, number>();
  for (const order of orderUsers ?? []) {
    userOrderCounts.set(order.user_id, (userOrderCounts.get(order.user_id) ?? 0) + 1);
  }
  const userIds = Array.from(userOrderCounts.keys());
  const { data: users } = userIds.length
    ? await supabase.from("profiles").select("id,name,email").in("id", userIds).returns<ProfileLite[]>()
    : { data: [] as ProfileLite[] };
  const userMap = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  const mostOrdersUser = Array.from(userOrderCounts.entries())
    .map(([id, count]) => ({ label: userMap.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count)[0];

  const stockRows = Array.from(new Map((itemRows ?? []).filter((r) => r.products).map((r) => [r.products!.id, r.products!])).values());
  const lowStockProducts = stockRows.filter((p) => p.stock > 0 && p.stock <= p.low_stock_threshold);
  const outOfStockProducts = stockRows.filter((p) => p.stock === 0);

  const monthlyMap = new Map<string, { orders: number; revenue: number }>();
  const yearlyMap = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders ?? []) {
    const d = new Date(order.created_at);
    const monthKey = d.toISOString().slice(0, 7);
    const yearKey = String(d.getUTCFullYear());

    const month = monthlyMap.get(monthKey) ?? { orders: 0, revenue: 0 };
    month.orders += 1;
    monthlyMap.set(monthKey, month);

    const year = yearlyMap.get(yearKey) ?? { orders: 0, revenue: 0 };
    year.orders += 1;
    yearlyMap.set(yearKey, year);
  }

  for (const row of acceptedItems) {
    if (!row.products) continue;
    const price = row.products.price - (row.products.price * row.products.discount) / 100;
    const rev = row.quantity_approved * price;
    const d = new Date(row.created_at);
    const monthKey = d.toISOString().slice(0, 7);
    const yearKey = String(d.getUTCFullYear());

    const month = monthlyMap.get(monthKey) ?? { orders: 0, revenue: 0 };
    month.revenue += rev;
    monthlyMap.set(monthKey, month);

    const year = yearlyMap.get(yearKey) ?? { orders: 0, revenue: 0 };
    year.revenue += rev;
    yearlyMap.set(yearKey, year);
  }

  const monthly = Array.from(monthlyMap.entries()).map(([period, data]) => ({ period, ...data })).sort((a, b) => (a.period < b.period ? -1 : 1));
  const yearly = Array.from(yearlyMap.entries()).map(([period, data]) => ({ period, ...data })).sort((a, b) => (a.period < b.period ? -1 : 1));

  const cards = [
    ["Total Orders", totalOrders],
    ["Accepted Orders", acceptedOrders],
    ["Rejected Orders", rejectedOrders],
    ["Partial Orders", partialOrders],
    ["Revenue", revenue.toFixed(2)],
    ["Most Sold Product", mostSoldProduct ? `${mostSoldProduct.label} (${mostSoldProduct.sold})` : "-"],
    ["Most Ordered Product", mostOrderedProduct ? `${mostOrderedProduct.label} (${mostOrderedProduct.count})` : "-"],
    ["Top Ordering User", mostOrdersUser ? `${mostOrdersUser.label} (${mostOrdersUser.count})` : "-"],
    ["Low Stock Products", lowStockProducts.length],
    ["Out of Stock Products", outOfStockProducts.length],
  ] as const;

  const message = typeof params.message === "string" ? params.message : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <AdminShell title="Analytics" subtitle={`Logged in as ${user.email ?? "admin"}`} currentPath="/admin/analytics">
      <AlertList message={message} error={error} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Date Filter</h2>
        <form action="/admin/analytics" className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">Start date<input type="date" name="start_date" defaultValue={startDate} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="grid gap-1">End date<input type="date" name="end_date" defaultValue={endDate} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700">Apply</button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
          </article>
        ))}
      </section>

      <AnalyticsChartsPanel monthly={monthly} yearly={yearly} />

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold">Low Stock Products</h3>
          <div className="mt-3 space-y-1 text-sm">
            {lowStockProducts.slice(0, 20).map((p) => (
              <p key={p.id}>{p.gsm}/{p.bf}/{p.inch}/{p.type} - stock {p.stock}</p>
            ))}
            {!lowStockProducts.length ? <p className="text-slate-500">No low stock products.</p> : null}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold">Out of Stock Products</h3>
          <div className="mt-3 space-y-1 text-sm">
            {outOfStockProducts.slice(0, 20).map((p) => (
              <p key={p.id}>{p.gsm}/{p.bf}/{p.inch}/{p.type}</p>
            ))}
            {!outOfStockProducts.length ? <p className="text-slate-500">No out of stock products.</p> : null}
          </div>
        </article>
      </section>
    </AdminShell>
  );
}
