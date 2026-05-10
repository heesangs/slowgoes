// 대시보드 로딩 스켈레톤 (PR 26 개선)
//
// /dashboard SSR 중 실제 레이아웃과 매칭되는 placeholder 즉시 표시.
// 사용자가 빈 화면 응시 시간을 0초로 만든다.
//
// 매칭 대상:
// - LifeClockHeader
// - 인사이트 / 지향점 / 실행계획 3섹션
// - + FAB는 fixed positioning이라 따로 표시 안 함

const SKELETON = "rounded bg-foreground/10";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 pb-24 animate-pulse" aria-label="대시보드 로딩 중">
      {/* LifeClockHeader 자리 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-3 w-20`} />
        <div className={`${SKELETON} mt-2 h-6 w-40`} />
        <div className={`${SKELETON} mt-3 h-1.5 w-full`} />
      </section>

      {/* 인사이트 섹션 (헤더 + 대화 아이콘 + 공감 메시지) */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <div className={`${SKELETON} h-3 w-16`} />
            <div className={`${SKELETON} h-5 w-32`} />
          </div>
          <div className={`${SKELETON} h-7 w-7`} />
        </div>
        <div className={`${SKELETON} mt-4 h-12 w-full`} />
      </section>

      {/* 지향점 섹션 (언젠가 + 1년 안 카드 2개) */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-4 w-16`} />
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
              <div className={`${SKELETON} h-3 w-12`} />
              <div className={`${SKELETON} mt-2 h-4 w-3/4`} />
            </div>
          ))}
        </div>
      </section>

      {/* 실행계획 섹션 (이번 달 카드 1개 + 본문 안 항목들 + 하단 버튼) */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className={`${SKELETON} h-4 w-16`} />
          <div className="flex gap-2">
            <div className={`${SKELETON} h-7 w-16`} />
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className={`${SKELETON} h-3 w-20`} />
            <div className={`${SKELETON} h-4 w-4`} />
          </div>
          <div className={`${SKELETON} mt-2 h-4 w-2/3`} />
          {/* 투두 placeholder */}
          <div className="mt-3 border-t border-foreground/10 pt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className={`${SKELETON} h-4 w-4`} />
              <div className={`${SKELETON} h-3 w-1/2`} />
            </div>
            <div className="flex items-center gap-2">
              <div className={`${SKELETON} h-4 w-4`} />
              <div className={`${SKELETON} h-3 w-2/3`} />
            </div>
          </div>
        </div>
        <div className={`${SKELETON} mt-3 h-9 w-full`} />
      </section>
    </div>
  );
}
