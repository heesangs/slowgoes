"use client";

import { Button } from "@/components/ui/button";
import { SegmentControl } from "@/components/ui/segment-control";
import { cn } from "@/lib/utils";
import type { Gender, PaceType, PersonalityType } from "@/types";
import {
  GENDER_OPTIONS,
  MBTI_ENERGY_OPTIONS,
  MBTI_JUDGMENT_OPTIONS,
  MBTI_LIFESTYLE_OPTIONS,
  MBTI_SENSE_OPTIONS,
  PACE_OPTIONS,
} from "./constants";
import type { LifeClockInfo } from "./utils";

interface StepProfileProps {
  age: number | null;
  gender: Gender | null;
  energyType: "I" | "E" | null;
  senseType: "S" | "N" | null;
  judgmentType: "T" | "F" | null;
  lifestyleType: "J" | "P" | null;
  personalityType: PersonalityType | null;
  paceType: PaceType | null;
  lifeClock: LifeClockInfo | null;
  error: string | null;
  onAgeChange: (value: string) => void;
  onGenderSelect: (value: Gender) => void;
  onEnergySelect: (value: "I" | "E") => void;
  onSenseSelect: (value: "S" | "N") => void;
  onJudgmentSelect: (value: "T" | "F") => void;
  onLifestyleSelect: (value: "J" | "P") => void;
  onPaceSelect: (value: PaceType) => void;
  onNext: () => void;
}

export function StepProfile({
  age,
  gender,
  energyType,
  senseType,
  judgmentType,
  lifestyleType,
  personalityType,
  paceType,
  lifeClock,
  error,
  onAgeChange,
  onGenderSelect,
  onEnergySelect,
  onSenseSelect,
  onJudgmentSelect,
  onLifestyleSelect,
  onPaceSelect,
  onNext,
}: StepProfileProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-foreground/15 bg-foreground/[0.03] p-5">
        <p className="mb-4 text-sm text-foreground/60">당신의 시간을 알려주세요</p>

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 rounded-full border-2 border-foreground/20 bg-background">
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60" />
            <div
              className={cn(
                "absolute left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-[95%] origin-bottom rounded-full bg-foreground transition-transform duration-300",
                lifeClock?.handClassName ?? "rotate-0"
              )}
            />
          </div>

          <div className="min-h-[48px]">
            {lifeClock ? (
              <p className="text-base font-semibold">당신의 시간은 {lifeClock.label}이에요.</p>
            ) : (
              <p className="text-sm text-foreground/50">나이를 입력하면 당신의 시간이 시작돼요.</p>
            )}
            {personalityType && (
              <p className="mt-1 text-xs text-foreground/50">현재 성향: {personalityType}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* 나이 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="life_clock_age" className="text-sm font-medium text-foreground/70">
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
            className="min-h-[44px] w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-base placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 성별 */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground/70">성별</p>
          <div className="grid grid-cols-2 gap-2">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onGenderSelect(option.value)}
                className={cn(
                  "min-h-[44px] cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                  gender === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:bg-foreground/5"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* MBTI — 4축 세그먼트 컨트롤 */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground/70">MBTI 성향</p>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-foreground/50">에너지 방향</p>
              <SegmentControl options={MBTI_ENERGY_OPTIONS} value={energyType} onChange={onEnergySelect} />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs text-foreground/50">정보 수집 방식</p>
              <SegmentControl options={MBTI_SENSE_OPTIONS} value={senseType} onChange={onSenseSelect} />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs text-foreground/50">판단 방식</p>
              <SegmentControl options={MBTI_JUDGMENT_OPTIONS} value={judgmentType} onChange={onJudgmentSelect} />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs text-foreground/50">생활 방식</p>
              <SegmentControl options={MBTI_LIFESTYLE_OPTIONS} value={lifestyleType} onChange={onLifestyleSelect} />
            </div>
          </div>
        </div>

        {/* 생활 속도 */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground/70">생활 속도</p>
          <SegmentControl options={PACE_OPTIONS} value={paceType} onChange={onPaceSelect} />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="button" onClick={onNext} className="w-full">
        시작하기
      </Button>
    </div>
  );
}
