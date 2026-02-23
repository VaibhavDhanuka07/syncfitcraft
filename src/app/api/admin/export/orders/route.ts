import PDFDocument from "pdfkit";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

type ExportRow = {
  order_id: string;
  user_name: string;
  product: string;
  requested_qty: number;
  approved_qty: number;
  status: string;
  date: string;
};
type OrderRow = { id: string; user_id: string; status: string; created_at: string };
type UserRow = { id: string; name: string | null; email: string };
type OrderItemRow = {
  order_id: string;
  product_id: string;
  quantity_requested: number;
  quantity_approved: number;
  status: string;
};
type ProductRow = { id: string; gsm: number; bf: number; inch: number };

function toCsv(rows: ExportRow[]) {
  const headers = ["Order ID", "User Name", "Product", "Requested Qty", "Approved Qty", "Status", "Date"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = [row.order_id, row.user_name, row.product, row.requested_qty, row.approved_qty, row.status, row.date]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",");
    lines.push(values);
  }
  return lines.join("\n");
}

async function getExportRows(request: NextRequest): Promise<ExportRow[]> {
  const supabase = await createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.status !== "approved") {
    throw new Error("Forbidden");
  }

  const month = request.nextUrl.searchParams.get("month");
  let fromDate: string | null = null;
  let toDate: string | null = null;

  if (month) {
    fromDate = `${month}-01T00:00:00`;
    const [year, monthPart] = month.split("-").map(Number);
    const end = new Date(year, monthPart, 0);
    const endDay = String(end.getDate()).padStart(2, "0");
    toDate = `${month}-${endDay}T23:59:59`;
  }

  let ordersQuery = supabase.from("orders").select("id,user_id,status,created_at").order("created_at", { ascending: false });

  if (fromDate) ordersQuery = ordersQuery.gte("created_at", fromDate);
  if (toDate) ordersQuery = ordersQuery.lte("created_at", toDate);

  const { data: orders } = await ordersQuery.returns<OrderRow[]>();

  const userIds = Array.from(new Set((orders ?? []).map((order) => order.user_id)));
  const orderIds = (orders ?? []).map((order) => order.id);

  const { data: users } = userIds.length
    ? await supabase.from("profiles").select("id,name,email").in("id", userIds).returns<UserRow[]>()
    : { data: [] as UserRow[] };

  const { data: items } = orderIds.length
    ? await supabase
        .from("order_items")
        .select("order_id,product_id,quantity_requested,quantity_approved,status")
        .in("order_id", orderIds)
        .returns<OrderItemRow[]>()
    : { data: [] as OrderItemRow[] };

  const productIds = Array.from(new Set((items ?? []).map((item) => item.product_id)));

  const { data: products } = productIds.length
    ? await supabase.from("products").select("id,gsm,bf,inch").in("id", productIds).returns<ProductRow[]>()
    : { data: [] as ProductRow[] };

  const userMap = new Map((users ?? []).map((entry) => [entry.id, entry.name || entry.email || entry.id]));
  const productMap = new Map((products ?? []).map((entry) => [entry.id, `${entry.gsm}/${entry.bf}/${entry.inch}`]));

  const rows: ExportRow[] = [];

  for (const order of orders ?? []) {
    const orderItems = (items ?? []).filter((item) => item.order_id === order.id);
    for (const item of orderItems) {
      rows.push({
        order_id: order.id,
        user_name: userMap.get(order.user_id) ?? order.user_id,
        product: productMap.get(item.product_id) ?? item.product_id,
        requested_qty: item.quantity_requested,
        approved_qty: item.quantity_approved,
        status: item.status,
        date: new Date(order.created_at).toISOString(),
      });
    }
  }

  return rows;
}

async function buildPdf(rows: ExportRow[]) {
  return await new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(14).text("Order Export", { underline: true });
    doc.moveDown(0.8);

    rows.forEach((row) => {
      doc
        .fontSize(9)
        .text(
          `Order: ${row.order_id} | User: ${row.user_name} | Product: ${row.product} | Req: ${row.requested_qty} | App: ${row.approved_qty} | Status: ${row.status} | Date: ${row.date}`,
        );
      doc.moveDown(0.4);
    });

    doc.end();
  });
}

export async function GET(request: NextRequest) {
  try {
    const format = request.nextUrl.searchParams.get("format") ?? "csv";
    const rows = await getExportRows(request);

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="orders.xlsx"',
        },
      });
    }

    if (format === "pdf") {
      const pdf = await buildPdf(rows);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="orders.pdf"',
        },
      });
    }

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="orders.csv"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
