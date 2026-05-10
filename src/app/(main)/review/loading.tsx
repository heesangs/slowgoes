// 회고/학습 페이지 로딩 스켈레톤 (PR 26 개선)
//
// PR 23~24로 위젯 구성이 바뀌었으므로 그에 맞춰 placeholder 매칭:
// 헤더 + 인생균형흐름 + 메트릭 2그리드 + 루틴 달성률 링 + 요일 패턴 + 인사이트 + 시간대 리듬 + 최근 기록

const SKELETON = "rounded bg-foreground/10";

export default function ReviewLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-label="회고 데이터 로딩 중">
      {/* 헤더 */}
      <div>
        <div className={`${SKELETON} h-7 w-32`} />
        <div className={`${SKELETON} mt-2 h-4 w-64`} />
      </div>

      {/* 인생균형흐름 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-3 w-20`} />
        <div className={`${SKELETON} mt-3 h-4 w-3/4`} />
        <div className={`${SKELETON} mt-2 h-3 w-1/2`} />
      </section>

      {/* 메트릭 2-그리드 */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-foreground/10 px-4 py-4">
          <div className={`${SKELETON} h-3 w-20`} />
          <div className={`${SKELETON} mt-2 h-6 w-16`} />
        </div>
        <div className="rounded-xl border border-foreground/10 px-4 py-4">
          <div className={`${SKELETON} h-3 w-24`} />
          <div className={`${SKELETON} mt-2 h-6 w-12`} />
        </div>
      </section>

      {/* PR 24: 루틴 달성률 링 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-3 w-32`} />
        <div className="mt-3 flex items-center gap-5">
          <div className={`${SKELETON} h-[120px] w-[120px] !rounded-full`} />
          <div className="flex-1">
            <div className={`${SKELETON} h-8 w-16`} />
            <div className={`${SKELETON} mt-2 h-3 w-24`} />
            <div className={`${SKELETON} mt-2 h-3 w-32`} />
          </div>
        </div>
      </section>

      {/* PR 24: 요일별 수행 패턴 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className={`${SKELETON} h-3 w-24`} />
          <div className={`${SKELETON} h-3 w-12`} />
        </div>
        <div className="mt-3 flex h-32 items-end gap-2">
          {[40, 25, 60, 35, 55, 45, 30].map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className={`${SKELETON} h-2 w-3`} />
              <div
                className="w-full rounded-t-sm bg-foreground/10 relative overflow-hidden"
                style={{ height: "100%" }}
              >
                <div className="absolute inset-x-0 bottom-0 bg-foreground/20" style={{ height: `${h}%` }} />
              </div>
              <div className={`${SKELETON} h-3 w-3`} />
            </div>
          ))}
        </div>
      </section>

      {/* 이번 회고 인사이트 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-3 w-20`} />
        <div className={`${SKELETON} mt-2 h-4 w-3/4`} />
        <div className={`${SKELETON} mt-1 h-4 w-2/3`} />
      </section>

      {/* 시간대 리듬 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-3 w-16`} />
        <div className="mt-3 flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`${SKELETON} h-3 w-24 shrink-0`} />
              <div className={`${SKELETON} h-2.5 flex-1`} />
              <div className={`${SKELETON} h-3 w-7 shrink-0`} />
            </div>
          ))}
        </div>
      </section>

      {/* 최근회고 기록 */}
      <section className="rounded-xl border border-foreground/10 px-4 py-4">
        <div className={`${SKELETON} h-3 w-20`} />
        <div className="mt-3 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-foreground/10 px-3 py-3">
              <div className={`${SKELETON} h-4 w-2/3`} />
              <div className={`${SKELETON} mt-2 h-3 w-1/3`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
