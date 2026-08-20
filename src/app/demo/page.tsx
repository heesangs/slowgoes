import { OnboardingForm } from "@/components/auth/onboarding-form";

// 체험판 — 로그인 없이 온보딩을 끝까지 돌려보는 화면.
//
// 상단 크롬(제목 · ‹ 뒤로 · 닫기)은 OnboardingForm이 스텝 상태를 알아야 그릴 수 있어
// 폼 안에서 렌더한다. 여기서는 페이지 높이만 잡는다.
export default function DemoPage() {
  return (
    <div className="min-h-dvh">
      <OnboardingForm mode="demo" />
    </div>
  );
}
