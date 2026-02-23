import { createClient } from "@/lib/supabase/server";

export async function getAdminOverview() {
  const supabase = await createClient();

  const [
    { count: totalProducts },
    { count: totalOrders },
    { count: accepted },
    { count: rejected },
    { count: partial },
    { data: productRows },
  ] =
    await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["accepted", "approved"]),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["partial", "partially_accepted"]),
      supabase.from("products").select("id,stock,low_stock_threshold"),
    ]);

  const lowStock = (productRows ?? []).filter((product: { stock: number; low_stock_threshold: number }) => {
    return product.stock > 0 && product.stock <= product.low_stock_threshold;
  }).length;

  return {
    totalProducts: totalProducts ?? 0,
    totalOrders: totalOrders ?? 0,
    acceptedOrders: accepted ?? 0,
    rejectedOrders: rejected ?? 0,
    partiallyAcceptedOrders: partial ?? 0,
    lowStockProducts: lowStock,
  };
}
