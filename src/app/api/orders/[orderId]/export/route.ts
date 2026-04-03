import { NextRequest, NextResponse } from "next/server";

import { createOrderExportPdf, createOrderExportWorkbook, isOrderExportable, type OrderExportData } from "@/lib/order-export";
import { createRouteClient } from "@/lib/supabase/route";
import type { OrderStatus, ProductType } from "@/lib/types";

export const runtime = "nodejs";

type RouteProfile = {
  id: string;
  role: "admin" | "client";
  status: string | null;
  approval_status: string | null;
};

type CustomerProfile = {
  id: string;
  name: string | null;
  email: string;
  firm_name: string | null;
};

type RouteOrder = {
  id: string;
  user_id: string;
  gsm: number;
  bf: number;
  inch: number;
  status: OrderStatus;
  created_at: string;
};

type RouteOrderItem = {
  id: string;
  quantity_requested: number;
  quantity_approved: number;
  item_status: "pending" | "accepted" | "rejected";
  products: {
    gsm: number;
    bf: number;
    inch: number | null;
    size: number | null;
    type: ProductType;
    price: number;
    discount: number;
  } | null;
};

function buildSpec(gsm: number | null | undefined, bf: number | null | undefined, inchOrSize: number | null | undefined, type?: ProductType | null) {
  const values = [gsm ?? "-", bf ?? "-", inchOrSize ?? "-"];
  if (type) {
    values.push(type);
  }
  return values.join("/");
}

async function getOrderExportData(orderId: string, requestUserId: string): Promise<OrderExportData> {
  const supabase = await createRouteClient();

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("id,role,status,approval_status")
    .eq("id", requestUserId)
    .maybeSingle()
    .returns<RouteProfile | null>();

  const { data: order } = await supabase
    .from("orders")
    .select("id,user_id,gsm,bf,inch,status,created_at")
    .eq("id", orderId)
    .maybeSingle()
    .returns<RouteOrder | null>();

  if (!order) {
    throw new Error("Not Found");
  }

  const approval = actorProfile?.approval_status ?? actorProfile?.status;
  const isApprovedAdmin = actorProfile?.role === "admin" && approval === "approved";
  const isOrderOwner = order.user_id === requestUserId;

  if (!isApprovedAdmin && !isOrderOwner) {
    throw new Error("Forbidden");
  }

  const { data: customer } = await supabase
    .from("profiles")
    .select("id,name,email,firm_name")
    .eq("id", order.user_id)
    .maybeSingle()
    .returns<CustomerProfile | null>();

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id,quantity_requested,quantity_approved,item_status,products(gsm,bf,inch,size,type,price,discount)")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true })
    .returns<RouteOrderItem[]>();

  if (!isOrderExportable(
    order.status,
    (orderItems ?? []).map((item) => ({
      itemStatus: item.item_status,
      approvedQuantity: item.quantity_approved,
    })),
  )) {
    throw new Error("Order Not Exportable");
  }

  const items = (orderItems ?? []).map((item) => {
    const requestedSpec = buildSpec(order.gsm, order.bf, order.inch);
    const acceptedSpec = buildSpec(
      item.products?.gsm,
      item.products?.bf,
      item.products?.size ?? item.products?.inch,
      item.products?.type,
    );
    const unitPrice = item.products
      ? item.products.price - (item.products.price * item.products.discount) / 100
      : 0;
    const approvedQuantity = item.quantity_approved ?? 0;

    return {
      requestedSpec,
      acceptedSpec,
      requestedQuantity: item.quantity_requested,
      approvedQuantity,
      rejectedQuantity: Math.max(item.quantity_requested - approvedQuantity, 0),
      unitPrice,
      lineTotal: approvedQuantity * unitPrice,
      itemStatus: item.item_status,
    };
  });

  return {
    orderId: order.id,
    customerName: customer?.name ?? customer?.email ?? order.user_id,
    customerEmail: customer?.email ?? "-",
    firmName: customer?.firm_name ?? null,
    orderStatus: order.status,
    createdAt: order.created_at,
    items,
    totalApprovedQuantity: items.reduce((sum, item) => sum + item.approvedQuantity, 0),
    grandTotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const supabase = await createRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { orderId } = await context.params;
    const format = request.nextUrl.searchParams.get("format") ?? "pdf";

    if (!["pdf", "xlsx"].includes(format)) {
      throw new Error("Unsupported Format");
    }

    const exportData = await getOrderExportData(orderId, user.id);
    const shortOrderId = exportData.orderId.slice(0, 8);

    if (format === "xlsx") {
      const workbook = await createOrderExportWorkbook(exportData);
      return new NextResponse(new Uint8Array(workbook), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="order-${shortOrderId}.xlsx"`,
        },
      });
    }

    const pdf = await createOrderExportPdf(exportData);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="order-${shortOrderId}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : message === "Not Found"
            ? 404
            : message === "Order Not Exportable"
              ? 400
              : message === "Unsupported Format"
                ? 400
                : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
