"use client";

import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/ui/segment-control";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Gender, PersonalityType } from "@/types";
import { GENDER_OPTIONS, MBTI_ENERGY_OPTIONS, MBTI_JUDGMENT_OPTIONS } from "./constants";
import type { LifeClockInfo } from "./utils";

interface StepProfileProps {
  age: number | null;
  gender: Gender | null;
  energyType: "I" | "E" | null;
  judgmentType: "T" | "F" | null;
  personalityType: PersonalityType | null;
  lifeClock: LifeClockInfo | null;
  error: string | null;
  onAgeChange: (value: string) => void;
  onGenderSelect: (value: Gender) => void;
  onEnergySelect: (value: "I" | "E") => void;
  onJudgmentSelect: (value: "T" | "F") => void;
  onNext: () => void;
}

export function StepProfile({
  age,
  gender,
  energyType,
  judgmentType,
  personalityType,
  lifeClock,
  error,
  onAgeChange,
  onGenderSelect,
  onEnergySelect,
  onJudgmentSelect,
  onNext,
}: StepProfileProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-line-alt bg-fill-alt p-5">
        <p className="mb-4 text-sm text-label-alt">{FEATURE_NAMES.MY_CLOCK}을 알려주세요</p>

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 rounded-full border-2 border-line-normal bg-background">
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-label-neutral" />
            <div
              className={cn(
                "absolute left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-[95%] origin-bottom rounded-full bg-inverse-background transition-transform duration-300",
                lifeClock?.handClassName ?? "rotate-0"
              )}
            />
          </div>

          <div className="min-h-[48px]">
            {lifeClock ? (
              <p className="text-base font-semibold">{FEATURE_NAMES.MY_CLOCK}은 {lifeClock.label}이에요.</p>
            ) : (
              <p className="text-sm text-label-alt">나이를 입력하면 {FEATURE_NAMES.MY_CLOCK}이 표시돼요.</p>
            )}
            {personalityType && (
              <p className="mt-1 text-xs text-label-alt">현재 성향: {personalityType}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* 나이 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="life_clock_age" className="text-sm font-medium text-label-alt">
            나이
          </label>
          <input
            id="life_clock_age"
            inputMode="numeric"
            type="number"
            min={0}
            max={100}
            placeholder="예: 27"
            value={age ?? ""}
            onChange={(e) => onAgeChange(e.target.value)}
            autoFocus
            className="min-h-[44px] w-full rounded-lg border border-line-normal bg-transparent px-4 py-3 text-base placeholder:text-label-alt focus:outline-none focus:ring-2 focus:ring-label-normal/20"
          />
        </div>

        {/* 성별 */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-label-alt">성별</p>
          <div className="grid grid-cols-2 gap-2">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onGenderSelect(option.value)}
                className={cn(
                  "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                  gender === option.value
                    ? "border-inverse-background bg-inverse-background text-inverse-label"
                    : "border-line-normal hover:bg-fill-alt"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* MBTI — 두 축만 묻는다. 나머지 두 축(S/N·J/P)은 마지막 단계의 선택 입력.
            추천 장면 시드가 실제로 쓰는 정보량이 정확히 이 두 축이다. */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-label-alt">MBTI 성향</p>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-label-alt">에너지 방향</p>
              <SegmentControl options={MBTI_ENERGY_OPTIONS} value={energyType} onChange={onEnergySelect} />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs text-label-alt">판단 방식</p>
              <SegmentControl options={MBTI_JUDGMENT_OPTIONS} value={judgmentType} onChange={onJudgmentSelect} />
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="button" onClick={onNext} className="w-full">
        시작하기
      </Button>
    </div>
  );
}
