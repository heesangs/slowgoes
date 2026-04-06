// 이메일 인증 콜백 — PKCE 코드를 세션으로 교환하고 적절한 페이지로 리다이렉트

import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/flags";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?verify=error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?verify=error`);
  }

  // 세션 생성 성공 → 프로필 존재 여부에 따라 분기
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }

    if (featureFlags.onboardingV2(user.id)) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
