import Link from "next/link";
import { DemoStartLink } from "@/components/auth/demo-start-link";
import { APP } from "@/lib/constants/brand";

// 첫 화면 — Figma 36902:44831.
//
// 로고와 한 줄 태그라인만 남기고 나머지는 뺐다(슬로건 3줄, 난이도 미리보기).
// Figma 는 375×680 고정에 gap 202 지만, 여기서는 로고를 위쪽·버튼을 아래쪽에 두고
// 사이를 유동 여백으로 채운다 — 화면 높이가 달라도 같은 인상이 나오게.
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-between px-6 pt-[19vh] pb-[calc(15vh+env(safe-area-inset-bottom))]">
      {/* 로고 블록. Figma(375×680)의 비율을 옮긴 것 —
          위 여백 19% · 로고 16% · 사이 30% · 행동 17% · 아래 18%.
          사이 간격이 가장 크므로 justify-between 으로 남는 높이를 그쪽에 준다. */}
      <div className="flex flex-col items-center gap-10">
        <h1 className="text-3xl font-bold text-label-neutral">{APP.NAME}</h1>
        <p className="text-base text-label-neutral">{APP.TAGLINE}</p>
      </div>

      {/* 행동 블록 */}
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex w-full gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded bg-primary-normal px-4 text-sm font-bold text-static-black transition-colors hover:bg-primary-strong active:bg-primary-heavy"
          >
            시작하기
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded border-2 border-label-primary bg-background px-4 text-sm font-bold text-label-primary transition-colors hover:bg-background-alt"
          >
            회원가입
          </Link>
        </div>

        <DemoStartLink className="inline-flex min-h-[44px] items-center justify-center rounded px-4 text-sm font-bold text-label-neutral transition-colors hover:bg-fill-alt active:bg-fill-normal" />
      </div>
    </div>
  );
}
