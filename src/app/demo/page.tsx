import { OnboardingForm } from "@/components/auth/onboarding-form";

// 체험판 — 로그인 없이 온보딩을 끝까지 돌려보는 화면.
//
// 상단 크롬(‹ 뒤로 · n/4)은 OnboardingForm이 스텝 상태를 알아야 그릴 수 있어
// 폼 안에서 렌더한다. 여기서는 페이지 높이만 잡는다.
//
// "처음부터 시작"은 랜딩의 DemoStartLink가 진입 전에 draft를 비우는 방식으로 처리한다.
export default function DemoPage() {
  return (
    <div className="min-h-dvh">
      <OnboardingForm mode="demo" />
    </div>
  );
}
