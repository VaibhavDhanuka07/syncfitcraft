import Papa from "papaparse";
import * as XLSX from "xlsx";
import { NextRequest, NextResponse } from "next/server";

import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

type StockRow = { product_id: string; stock: number };
type OrderRow = { order_id: string; status: string };

function readRows(fileName: string, fileBuffer: Buffer, contentText: string): Array<Record<string, string | number>> {
  if (fileName.toLowerCase().endsWith(".xlsx")) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);
  }

  const parsed = Papa.parse<Record<string, string | number>>(contentText, { header: true, skipEmptyLines: true });
  return parsed.data;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role,status,approval_status").eq("id", user.id).maybeSingle();
    const approval = profile?.approval_status ?? profile?.status;
    if (!profile || profile.role !== "admin" || approval !== "approved") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const target = String(formData.get("target") ?? "stock").toLowerCase();

    if (!(file instanceof File)) return NextResponse.json({ error: "File required" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const text = fileBuffer.toString("utf-8");
    const rows = readRows(file.name, fileBuffer, text);

    if (target === "orders") {
      const payload: OrderRow[] = rows.map((r) => ({
        order_id: String(r.order_id ?? "").trim(),
        status: String(r.status ?? "").trim().toLowerCase(),
      })).filter((r) => r.order_id && r.status);

      const { data, error } = await supabase.rpc("admin_bulk_update_orders", { p_rows: payload as unknown as object });
      if (error) throw error;
      return NextResponse.json(data);
    }

    let updated = 0;
    let created = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const productId = String(row.product_id ?? "").trim();
        const gsm = Number(row.gsm ?? 0);
        const bf = Number(row.bf ?? 0);
        const inch = Number(row.inch ?? row.size ?? 0);
        const type = String(row.type ?? "GY").trim().toUpperCase();
        const stock = Number(row.stock ?? row.available_reels ?? 0);
        const price = Number(row.price ?? 0);
        const discount = Number(row.discount ?? 0);

        if (!Number.isInteger(stock) || stock < 0 || Number.isNaN(price) || Number.isNaN(discount)) {
          errors += 1;
          continue;
        }

        if (productId) {
          const { error } = await supabase
            .from("products")
            .update({ stock, available_reels: stock, price, discount })
            .eq("id", productId);
          if (error) throw error;
          updated += 1;
          continue;
        }

        if (!Number.isInteger(gsm) || !Number.isInteger(bf) || !Number.isInteger(inch) || !["GY", "NS"].includes(type)) {
          errors += 1;
          continue;
        }

        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("gsm", gsm)
          .eq("bf", bf)
          .eq("inch", inch)
          .eq("type", type)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("products")
            .update({ stock, available_reels: stock, price, discount })
            .eq("id", existing.id);
          if (error) throw error;
          updated += 1;
        } else {
          const { error } = await supabase.from("products").insert({
            gsm,
            bf,
            inch,
            size: inch,
            type,
            stock,
            available_reels: stock,
            price,
            discount,
            is_active: true,
          });
          if (error) throw error;
          created += 1;
        }
      } catch {
        errors += 1;
      }
    }

    return NextResponse.json({ updated, created, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
