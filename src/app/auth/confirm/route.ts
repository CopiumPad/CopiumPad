import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const emailOtpTypes = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
  "reauthentication",
] as const satisfies readonly EmailOtpType[];

function isEmailOtpType(value: string | null): value is (typeof emailOtpTypes)[number] {
  return value !== null && (emailOtpTypes as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/?auth=error", request.url));
  const supabase = await createSupabaseServerClient(response);
  const code = request.nextUrl.searchParams.get("code");
  let error: Error | null = null;
  let isVerified = false;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
    isVerified = !error;
  } else {
    const tokenHash = request.nextUrl.searchParams.get("token_hash");
    const otpType = request.nextUrl.searchParams.get("type");
    if (tokenHash && isEmailOtpType(otpType)) {
      ({ error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      }));
      isVerified = !error;
    }
  }

  if (isVerified) {
    response.headers.set("location", new URL("/", request.url).toString());
  }
  return response;
}