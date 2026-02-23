import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const html = String(body.html ?? "").trim();

    if (!to || !subject || !html) {
      return NextResponse.json({ error: "to, subject, html are required" }, { status: 400 });
    }

    await sendEmail({ to, subject, html });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
