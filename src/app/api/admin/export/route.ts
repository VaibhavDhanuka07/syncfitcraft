import ExcelJS from "exceljs";
import { Parser } from "json2csv";
import { NextRequest, NextResponse } from "next/server";

import { createPdfBuffer } from "@/lib/pdf";
import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

type ExportRow = {
  order_id: string;
  user: string;
  product: string;
  type: string;
  status: string;
  quantity: number;
  price: number;
  date: string;
};
type ExportOrderItemRow = {
  order_id: string;
  product_id: string;
  quantity_requested: number;
  quantity_approved: number;
  item_status: string;
};
type ExportOrderRow = {
  id: string;
  status: string;
  created_at: string;
  user_id: string;
};
type ExportUserRow = { id: string; name: string | null; email: string | null };
type ExportProductRow = { id: string; gsm: number; bf: number; inch: number | null; size: number | null; type: string; price: number; discount: number };

function getRangeStart(range: string) {
  const now = new Date();
  if (range === "daily") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "3months") return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (range === "6months") return new Date(now.getFullYear(), now.getMonth() - 5, 1);
  if (range === "1year") return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (range === "financial_year") {
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return new Date(year, 3, 1);
  }
  return null;
}

async function getRows(request: NextRequest): Promise<ExportRow[]> {
  const range = request.nextUrl.searchParams.get("range") ?? "overall";
  const start = getRangeStart(range);

  const supabase = await createRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase.from("profiles").select("role,status,approval_status").eq("id", user.id).maybeSingle();
  const approval = profile?.approval_status ?? profile?.status;
  if (!profile || profile.role !== "admin" || approval !== "approved") throw new Error("Forbidden");

  let query = supabase.from("orders").select("id,status,created_at,user_id").order("created_at", { ascending: false });

  if (start) query = query.gte("created_at", start.toISOString());

  const { data: orders } = await query.returns<ExportOrderRow[]>();
  const orderIds = (orders ?? []).map((order) => order.id);
  const userIds = Array.from(new Set((orders ?? []).map((order) => order.user_id)));

  const { data: users } = userIds.length
    ? await supabase.from("profiles").select("id,name,email").in("id", userIds).returns<ExportUserRow[]>()
    : { data: [] as ExportUserRow[] };

  const { data: items } = orderIds.length
    ? await supabase
        .from("order_items")
        .select("order_id,product_id,quantity_requested,quantity_approved,item_status")
        .in("order_id", orderIds)
        .returns<ExportOrderItemRow[]>()
    : { data: [] as ExportOrderItemRow[] };

  const productIds = Array.from(new Set((items ?? []).map((item) => item.product_id)));
  const { data: products } = productIds.length
    ? await supabase
        .from("products")
        .select("id,gsm,bf,inch,size,type,price,discount")
        .in("id", productIds)
        .returns<ExportProductRow[]>()
    : { data: [] as ExportProductRow[] };

  const userById = new Map((users ?? []).map((entry) => [entry.id, entry]));
  const productById = new Map((products ?? []).map((entry) => [entry.id, entry]));
  const itemsByOrder = new Map<string, ExportOrderItemRow[]>();
  for (const item of items ?? []) {
    const bucket = itemsByOrder.get(item.order_id) ?? [];
    bucket.push(item);
    itemsByOrder.set(item.order_id, bucket);
  }

  const rows: ExportRow[] = [];
  for (const order of orders ?? []) {
    const orderUser = userById.get(order.user_id);
    for (const item of itemsByOrder.get(order.id) ?? []) {
      const product = productById.get(item.product_id);
      const price = (product?.price ?? 0) - ((product?.price ?? 0) * (product?.discount ?? 0)) / 100;
      rows.push({
        order_id: order.id,
        user: orderUser?.name ?? orderUser?.email ?? order.user_id,
        product: `${product?.gsm ?? "-"}/${product?.bf ?? "-"}/${product?.inch ?? product?.size ?? "-"}`,
        type: product?.type ?? "-",
        status: item.item_status ?? order.status,
        quantity: item.quantity_approved ?? 0,
        price,
        date: order.created_at,
      });
    }
  }

  return rows;
}

async function createXlsx(rows: ExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");
  sheet.columns = [
    { header: "Order ID", key: "order_id", width: 30 },
    { header: "User", key: "user", width: 24 },
    { header: "Product", key: "product", width: 20 },
    { header: "Type", key: "type", width: 10 },
    { header: "Status", key: "status", width: 15 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Price", key: "price", width: 12 },
    { header: "Date", key: "date", width: 24 },
  ];
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function createPdf(rows: ExportRow[]) {
  return await createPdfBuffer((doc) => {
    doc.fontSize(12).text("Orders Report");
    doc.moveDown(0.8);
    for (const row of rows) {
      doc.fontSize(8).text(`${row.order_id} | ${row.user} | ${row.product}/${row.type} | ${row.status} | ${row.quantity} | ${row.price.toFixed(2)} | ${row.date}`);
    }
  }, { margin: 30 });
}

export async function GET(request: NextRequest) {
  try {
    const format = request.nextUrl.searchParams.get("type") ?? "csv";
    const rows = await getRows(request);

    if (format === "xlsx") {
      const file = await createXlsx(rows);
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="orders-report.xlsx"',
        },
      });
    }

    if (format === "pdf") {
      const file = await createPdf(rows);
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="orders-report.pdf"',
        },
      });
    }

    const parser = new Parser({ fields: ["order_id", "user", "product", "type", "status", "quantity", "price", "date"] });
    const csv = parser.parse(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="orders-report.csv"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
