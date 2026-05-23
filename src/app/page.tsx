import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <main className="flex max-w-2xl flex-col items-center gap-8 text-center">
        {/* 로고 및 타이틀 */}
        <h1 className="text-5xl font-bold tracking-tight">
          slow<span className="text-white">goes</span>
        </h1>

        {/* 슬로건 */}
        <p className="text-xl text-zinc-600 dark:text-zinc-400">
          나의 속도로, 천천히
        </p>

        {/* 설명 */}
        <p className="max-w-md text-base leading-relaxed text-zinc-500 dark:text-zinc-500">
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

        <Link
          href="/demo"
          className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground hover:underline"
        >
          로그인 없이 체험해보기 →
        </Link>
      </main>
    </div>
  );
}
