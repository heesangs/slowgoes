"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FEATURE_NAMES } from "@/lib/constants";
import { getDemoScenes } from "@/lib/onboarding/demo-scenes";
import type { DemoSceneItem, Gender, OnboardingSceneCategory, PersonalityType } from "@/types";
import { LIFE_CATEGORIES, type LifeCategory } from "./constants";
import type { LifeClockInfo } from "./utils";

interface StepSceneProps {
  age: number | null;
  gender: Gender | null;
  personalityType: PersonalityType | null;
  lifeClock: LifeClockInfo | null;
  selectedLifeCategory: LifeCategory | null;
  sceneCategory: OnboardingSceneCategory["key"];
  selectedDemoScene: DemoSceneItem | null;
  customSceneInput: string;
  showGoalChat: boolean;
  selectedSceneText: string;
  isProfileStep: boolean;
  error: string | null;
  onLifeCategorySelect: (key: LifeCategory) => void;
  onDemoSceneSelect: (item: DemoSceneItem) => void;
  onCustomSceneChange: (value: string) => void;
  onToggleGoalChat: () => void;
  onCloseGoalChat: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepScene({
  age,
  gender,
  personalityType,
  lifeClock,
  selectedLifeCategory,
  sceneCategory,
  selectedDemoScene,
  customSceneInput,
  showGoalChat,
  selectedSceneText,
  isProfileStep,
  error,
  onLifeCategorySelect,
  onDemoSceneSelect,
  onCustomSceneChange,
  onToggleGoalChat,
  onCloseGoalChat,
  onNext,
  onBack,
}: StepSceneProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
        <p className="text-sm text-foreground/60">인생시계</p>
        <p className="text-base font-semibold">
          {lifeClock ? `당신의 인생 시계는 ${lifeClock.label}이에요.` : "당신의 시간을 알려주세요"}
        </p>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold">내가 원하는게 뭘까요?</h2>
      </div>

      {/* 카테고리 4개 카드 — 2×2 그리드 */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground/60">
          하나만 선택할 수 있어요. 마음이 1%라도 더 기우는 쪽으로!
        </p>
        <div className="grid grid-cols-2 gap-2">
          {LIFE_CATEGORIES.map((cat) => {
            const isSelected = selectedLifeCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onLifeCategorySelect(cat.key)}
                className={cn(
                  "flex flex-col items-start rounded-xl border px-4 py-4 text-left transition-colors",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/15 hover:bg-foreground/[0.04]"
                )}
              >
                <span className="text-2xl">{cat.icon}</span>
                <p className="mt-2 text-sm font-semibold">{cat.label}</p>
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    isSelected ? "text-background/80" : "text-foreground/60"
                  )}
                >
                  {cat.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택된 카테고리에 맞는 추천 장면 */}
      {selectedLifeCategory && gender && personalityType && age !== null && (
        <div className="flex flex-col gap-2">
          {getDemoScenes({ category: sceneCategory, age, gender, personalityType }).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onDemoSceneSelect(item)}
              className={cn(
                "min-h-[44px] cursor-pointer rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                selectedDemoScene?.id === item.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:bg-foreground/5"
              )}
            >
              {item.text}
            </button>
          ))}
        </div>
      )}

      {/* 직접 입력 */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="custom_scene" className="text-sm font-medium text-foreground/70">
          직접 입력 ✏️
        </label>
        <textarea
          id="custom_scene"
          value={customSceneInput}
          onChange={(e) => onCustomSceneChange(e.target.value)}
          placeholder="예: 부모님과 여행 가기"
          rows={3}
          className="min-h-[88px] w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      {/* 목표를 이룬 나와 대화해보기 */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onToggleGoalChat}
          className="flex w-full items-center justify-between rounded-xl border border-foreground/10 px-4 py-3 text-left text-sm transition-colors hover:bg-foreground/[0.04]"
        >
          <span>💬 목표를 이룬 나와 대화해보기</span>
          <span className="text-foreground/60">→</span>
        </button>
        {showGoalChat && (
          <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 py-4">
            <p className="text-sm text-foreground/60">
              이 기능은 곧 출시될 예정이에요. 목표를 이룬 미래의 나와 대화하며 방향을 찾아볼 수 있어요.
            </p>
            <button
              type="button"
              onClick={onCloseGoalChat}
              className="mt-2 text-xs text-foreground/50 underline"
            >
              닫기
            </button>
          </div>
        )}
      </div>

      {selectedSceneText && (
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
          <p className="mb-1 text-xs text-foreground/50">선택한 {FEATURE_NAMES.LIFE_SCENE}</p>
          <p className="text-sm font-medium">{selectedSceneText}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        {isProfileStep && (
          <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
            이전
          </Button>
        )}
        <Button type="button" onClick={onNext} className="flex-1">
          다음
        </Button>
      </div>
    </div>
  );
}
