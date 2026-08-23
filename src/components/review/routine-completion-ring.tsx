// 이번 주 루틴 달성률 링 (Apple Watch 스타일) — PR 24
//
// PDF "2.e. ... 이번 주 루틴 달성률(%) ... 프로그레스 링(Apple Watch 스타일)으로 보여준다"
// 데이터: PR 22의 일 단위 routine_completions로 계산.

import { FEATURE_NAMES } from "@/lib/constants";
import type { WeeklyRoutineRate } from "@/types";
import { Card } from "@/components/ui/card";

interface RoutineCompletionRingProps {
  rate: WeeklyRoutineRate;
}

const SIZE = 120;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RoutineCompletionRing({ rate }: RoutineCompletionRingProps) {
  const ratio = Math.min(1, Math.max(0, rate.percentage / 100));
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  return (
    <Card as="section" padded>
      <p className="mb-3 text-sm text-label-alt">이번 주 {FEATURE_NAMES.ROUTINE} 달성률</p>

      <div className="flex items-center gap-5">
        {/* SVG 링 */}
        <div className="shrink-0">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            aria-label={`이번 주 루틴 달성률 ${rate.percentage}%`}
          >
            {/* 트랙 */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-fill-normal"
            />
            {/* 진행도 (12시 방향에서 시작, 시계방향) */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              className="text-label-normal transition-[stroke-dashoffset] duration-500"
            />
          </svg>
        </div>

        {/* 수치 + 메타 */}
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-bold leading-tight">{rate.percentage}%</p>
          <p className="mt-1 text-sm text-label-alt">
            {rate.completed} / {rate.total}회 달성
          </p>
          <p className="mt-2 text-xs text-label-assistive">
            {rate.total === 0
              ? `활성 ${FEATURE_NAMES.ROUTINE}이 없어요. 새 ${FEATURE_NAMES.ROUTINE}을 추가해보세요.`
              : rate.percentage >= 80
                ? "이번 주 흐름이 정말 좋아요 ✨"
                : rate.percentage >= 50
                  ? "이번 주 절반 넘게 채웠어요"
                  : "조금씩 더 쌓아가요"}
          </p>
        </div>
      </div>
    </Card>
  );
}
