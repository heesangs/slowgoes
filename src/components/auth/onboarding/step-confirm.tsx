"use client";

import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/ui/segment-control";
import { FEATURE_NAMES } from "@/lib/constants";
import type { LifeSceneAnalysisResult, PersonalityType } from "@/types";
import { MBTI_LIFESTYLE_OPTIONS, MBTI_SENSE_OPTIONS } from "./constants";
import type { LifeClockInfo } from "./utils";
import { Card } from "@/components/ui/card";

interface StepConfirmProps {
  /** 확정 화면에서 다시 보여주는 나의 시간 */
  lifeClock: LifeClockInfo | null;
  /** 지금까지 채워진 MBTI — 2글자면 아래 보완 입력이 열려 있다 */
  personalityType: PersonalityType | null;
  senseType: "S" | "N" | null;
  lifestyleType: "J" | "P" | null;
  onSenseSelect: (value: "S" | "N") => void;
  onLifestyleSelect: (value: "J" | "P") => void;
  selectedSceneText: string;
  lifeSceneAnalysis: LifeSceneAnalysisResult | null;
  selectedDailyTodo: string;
  error: string | null;
  isLoading: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function StepConfirm({
  lifeClock,
  personalityType,
  senseType,
  lifestyleType,
  onSenseSelect,
  onLifestyleSelect,
  selectedSceneText,
  lifeSceneAnalysis,
  selectedDailyTodo,
  error,
  isLoading,
  onBack,
  onSubmit,
}: StepConfirmProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-base font-semibold">선택한 한 걸음</h2>
        <p className="text-sm text-label-alt">확정하면 대시보드에 오늘의 한 걸음으로 연결돼요</p>
      </div>

      {/* 나의 시간 + 성향 — 확정 직전에 "지금 내가 어디쯤인지"를 한 번 더 보여준다 */}
      <div className="rounded-xl border border-line-alt bg-fill-alt px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-label-alt">{FEATURE_NAMES.MY_CLOCK}</p>
          {personalityType && (
            <p className="text-xs font-medium text-label-alt">{personalityType}</p>
          )}
        </div>
        <p className="mt-0.5 text-base font-semibold">
          {lifeClock ? `${lifeClock.meridiem} ${lifeClock.hour12}시 ${String(lifeClock.minute).padStart(2, "0")}분` : "-"}
        </p>

        {/* MBTI 보완 입력 — 두 축만 답한 상태면 여기서 마저 채울 수 있다.
            필수가 아니고, 넣어도 이미 나온 분석을 다시 돌리지 않는다(저장만). */}
        <div className="mt-4 flex flex-col gap-2 border-t border-line-alt pt-3">
          <p className="text-xs text-label-alt">
            성향을 더 알려주시면 다음 추천이 정확해져요 <span className="text-label-alt">(선택)</span>
          </p>
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-label-alt">정보 수집 방식</p>
            <SegmentControl options={MBTI_SENSE_OPTIONS} value={senseType} onChange={onSenseSelect} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-label-alt">생활 방식</p>
            <SegmentControl options={MBTI_LIFESTYLE_OPTIONS} value={lifestyleType} onChange={onLifestyleSelect} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line-alt bg-fill-alt px-4 py-4">
        <p className="mb-1 text-xs text-label-alt">선택한 장면</p>
        <p className="text-sm font-medium">{selectedSceneText}</p>
        {lifeSceneAnalysis?.lifeArea && (
          <p className="mt-1 text-xs text-label-alt">영역: {lifeSceneAnalysis.lifeArea}</p>
        )}
      </div>

      <Card padded>
        <p className="text-xs text-label-alt">{FEATURE_NAMES.DAILY_TODO}</p>
        {selectedDailyTodo ? (
          <p className="mt-1 text-sm font-medium">{selectedDailyTodo}</p>
        ) : (
          <p className="mt-1 text-sm text-label-alt">선택하지 않았어요.</p>
        )}
      </Card>

      {error && <p className="text-center text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          이전
        </Button>
        <Button type="button" onClick={onSubmit} isLoading={isLoading} className="flex-1" disabled={isLoading}>
          확정하기
        </Button>
      </div>
    </div>
  );
}
