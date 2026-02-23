import { NextResponse } from "next/server";

import { createRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

function parseLine(line: string) {
  const [gsm, bf, inch, available] = line.split(",").map((item) => item.trim());
  const values = {
    gsm: Number(gsm),
    bf: Number(bf),
    inch: Number(inch),
    available_reels: Number(available),
  };

  if (
    !Number.isInteger(values.gsm) ||
    !Number.isInteger(values.bf) ||
    !Number.isInteger(values.inch) ||
    !Number.isInteger(values.available_reels) ||
    values.available_reels < 0
  ) {
    throw new Error("Invalid numeric row");
  }

  return values;
}

export async function POST(request: Request) {
  try {
    const supabase = await createRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,status")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin" || profile.status !== "approved") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }

    const content = await file.text();
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
    }

    const rows = lines[0].toLowerCase().startsWith("gsm") ? lines.slice(1) : lines;

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const line of rows) {
      try {
        const parsed = parseLine(line);

        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("gsm", parsed.gsm)
          .eq("bf", parsed.bf)
          .eq("inch", parsed.inch)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("products")
            .update({ available_reels: parsed.available_reels })
            .eq("id", existing.id);
          if (error) throw error;
          updated += 1;
        } else {
          const { error } = await supabase.from("products").insert(parsed);
          if (error) throw error;
          created += 1;
        }
      } catch {
        errors += 1;
      }
    }

    return NextResponse.json({ created, updated, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
