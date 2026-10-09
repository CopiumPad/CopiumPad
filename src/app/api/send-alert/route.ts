import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TriggeredAlert = {
  id: string;
  type: "price" | "deposit";
  target_symbol: string | null;
  target_price: number | string | null;
  custom_message: string;
  is_triggered: boolean;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function POST(request: NextRequest) {
  let alertId: unknown;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("alertId" in body)) {
      return NextResponse.json({ error: "A valid alertId is required." }, { status: 400 });
    }
    alertId = body.alertId;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof alertId !== "string" || !/^[0-9a-f-]{36}$/i.test(alertId)) {
    return NextResponse.json({ error: "A valid alertId is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "Your account does not have an email address." }, { status: 400 });
  }

  const { data, error: alertError } = await supabase
    .from("alerts")
    .select("id, type, target_symbol, target_price, custom_message, is_triggered")
    .eq("id", alertId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (alertError) {
    return NextResponse.json({ error: "Could not load this alert." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }

  const alert = data as TriggeredAlert;
  if (!alert.is_triggered) {
    return NextResponse.json({ error: "This alert has not been triggered." }, { status: 409 });
  }
  if (!process.env.RESEND_EMAIL_API_KEY) {
    return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
  }

  const typeLabel = alert.type === "price" ? "Price Alert" : "Deposit Alert";
  const subject = alert.type === "price" && alert.target_symbol
    ? `CopiumPad ${typeLabel}: ${alert.target_symbol}`
    : `CopiumPad ${typeLabel}`;
  const message = escapeHtml(alert.custom_message);
  const resend = new Resend(process.env.RESEND_EMAIL_API_KEY);
  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "CopiumPad <onboarding@resend.dev>",
    to: [user.email],
    subject,
    text: `From CopiumPad,\n\n${alert.custom_message}`,
    html: `<div style="margin:0;background:#09090b;padding:40px 20px;color:#f4f4f5;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace"><div style="max-width:560px;margin:0 auto;border:1px solid #27272a;background:#111113;padding:28px"><p style="margin:0 0 18px;color:#a1a1aa;font-size:12px;letter-spacing:.08em;text-transform:uppercase">CopiumPad Alert</p><p style="margin:0 0 12px;color:#34d399;font-size:14px">From CopiumPad,</p><p style="margin:0;color:#f4f4f5;font-size:14px;line-height:1.7;white-space:pre-wrap">${message}</p></div></div>`,
  });
  if (sendError) {
    return NextResponse.json({ error: "Email delivery failed." }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}