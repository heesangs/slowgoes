import Link from "next/link";
import { DemoStartLink } from "@/components/auth/demo-start-link";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <main className="flex max-w-2xl flex-col items-center gap-8 text-center">
        {/* 로고 및 타이틀 */}
        {/* 로고는 한 덩어리로. 예전엔 "goes"에 text-white를 줬는데 라이트 배경이
            #ffffff라 밝기차가 0이 되어 "slow"까지만 보였다(다크 배경 전제의 잔재). */}
        <h1 className="text-5xl font-bold tracking-tight">slowgoes</h1>

        {/* 슬로건 */}
        {/* 앱 테마는 :root[data-theme] 속성 기반이라 Tailwind의 dark:(prefers-color-scheme)는
            프로필에서 고른 다크를 따라가지 못한다 → foreground 토큰으로 통일.
            투명도는 대비를 재서 정했다 — /60은 3.69:1로 본문 기준(4.5:1)에 미달한다. */}
        <p className="text-xl text-foreground/80">
          나의 속도로, 천천히
        </p>

        {/* 설명 */}
        <p className="max-w-md text-base leading-relaxed text-foreground/70">
          우린 멀리보고 소중하게 한걸음을 내딛자고요.
          <br />
          내 속도에 맞게, 내 리듬에 맞게, 
          <br />
          실행가능한 목표를 하나씩.
        </p>

        {/* 난이도 시각화 미리보기 */}
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            🌱 쉬움
          </span>
          <span className="flex items-center gap-1.5">
            🌿 보통
          </span>
          <span className="flex items-center gap-1.5">
            🌳 어려움
          </span>
        </div>

        {/* CTA 버튼 */}
        <div className="flex gap-4">
          <Link
            href="/login"
            className="rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background transition-colors hover:opacity-90"
          >
            시작하기
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-foreground/20 px-8 py-3 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            회원가입
          </Link>
        </div>

        <DemoStartLink className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground hover:underline" />
      </main>
    </div>
  );
}
