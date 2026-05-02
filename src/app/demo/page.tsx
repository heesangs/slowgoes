import { OnboardingForm } from "@/components/auth/onboarding-form";
import { FEATURE_NAMES } from "@/lib/constants";

export default function DemoPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/60">
            체험판
          </p>
          <h1 className="mb-2 text-2xl font-bold">{FEATURE_NAMES.FIND_ME}</h1>
          <p className="text-sm text-foreground/60">
            로그인 없이 온보딩을 체험해보세요.
            <br />
            결과는 이 브라우저에만 저장됩니다.
          </p>
        </div>

        <OnboardingForm mode="demo" />
      </div>
    </div>
  );
}
