// 온보딩 페이지 — 프로필 미설정 사용자에게 표시

import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/flags";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { DemoDataMigrator } from "@/components/auth/demo-data-migrator";
import type { Gender, PersonalityType } from "@/types";

interface OnboardingPageProps {
  searchParams?: Promise<{ step?: string }>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createClient();
  const resolvedSearchParams = (await searchParams) ?? {};
  const startStep2 = resolvedSearchParams.step === "2";

  // 인증 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!featureFlags.onboardingV2(user.id)) {
    redirect("/dashboard");
  }

  // 프로필 정보 조회
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, life_clock_age, gender, personality_type")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && !startStep2) {
    redirect("/dashboard");
  }

  const prefillProfile =
    startStep2 &&
    profile?.life_clock_age != null &&
    (profile.gender === "male" || profile.gender === "female") &&
    (profile.personality_type === "IT" ||
      profile.personality_type === "IF" ||
      profile.personality_type === "ET" ||
      profile.personality_type === "EF")
      ? {
          age: profile.life_clock_age,
          gender: profile.gender as Gender,
          personalityType: profile.personality_type as PersonalityType,
        }
      : null;

  // v1 사용자가 step=2로 왔지만 v2 프로필 필드(나이/성별/성향)가 없는 경우
  // → 순환 리다이렉트 방지: step 1부터 시작하여 필드를 채우도록 안내
  const effectiveStartStep = startStep2 && prefillProfile ? 2 : 1;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">탐색 시작</h1>
          <p className="text-sm text-foreground/60">
            내 시간과 리듬을 먼저 살펴볼게요
          </p>
        </div>

        <DemoDataMigrator>
          <OnboardingForm startStep={effectiveStartStep} prefillProfile={prefillProfile} />
        </DemoDataMigrator>
      </div>
    </div>
  );
}
