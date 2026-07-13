// 프로필 로딩 스켈레톤.

const SKELETON = "rounded bg-foreground/10";

export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-label="프로필 로딩 중">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4">
        <div className={`${SKELETON} h-14 w-14 shrink-0 rounded-full`} />
        <div className="flex flex-col gap-2">
          <div className={`${SKELETON} h-6 w-32`} />
          <div className={`${SKELETON} h-4 w-40`} />
        </div>
      </div>

      {/* 카드 2개 */}
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-foreground/10 px-4 py-4">
          <div className={`${SKELETON} h-5 w-24`} />
          <div className={`${SKELETON} mt-4 h-10 w-full`} />
          <div className={`${SKELETON} mt-3 h-10 w-full`} />
        </div>
      ))}
    </div>
  );
}
