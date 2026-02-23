import { NextResponse } from "next/server";

import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gsm = Number(url.searchParams.get("gsm") ?? "");
    const bf = Number(url.searchParams.get("bf") ?? "");
    const inch = Number(url.searchParams.get("inch") ?? "");
    const type = String(url.searchParams.get("type") ?? "").trim().toUpperCase();

    if (!Number.isInteger(gsm) || !Number.isInteger(bf) || !Number.isInteger(inch) || !["GY", "NS"].includes(type)) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const supabase = await createRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: products } = await supabase
      .from("products")
      .select("inch,size,stock,available_reels,price,discount")
      .eq("gsm", gsm)
      .eq("bf", bf)
      .eq("type", type)
      .eq("is_active", true)
      .returns<Array<{ inch: number | null; size: number | null; stock: number | null; available_reels: number | null; price: number | null; discount: number | null }>>();

    const matched = (products ?? []).find((product) => product.inch === inch || product.size === inch);
    const availableStock = matched ? (matched.stock ?? matched.available_reels ?? 0) : 0;
    const price = matched?.price ?? 0;
    const discount = matched?.discount ?? 0;
    const effectivePrice = price - (price * discount) / 100;

    return NextResponse.json({ available_stock: availableStock, price, discount, effective_price: effectivePrice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
