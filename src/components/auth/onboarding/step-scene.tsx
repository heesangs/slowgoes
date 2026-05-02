"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDemoScenes } from "@/lib/onboarding/demo-scenes";
import type { DemoSceneItem, Gender, OnboardingSceneCategory, PersonalityType } from "@/types";
import { LIFE_CATEGORIES, type LifeCategory } from "./constants";
import type { LifeClockInfo } from "./utils";

// scene text 길이 가이드라인
const SCENE_MIN_LENGTH = 2;
const SCENE_MAX_LENGTH = 60;

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
  /** AI 분석 진행 여부 — true면 다음 버튼 disabled */
  isSubmitting?: boolean;
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
  isSubmitting = false,
  onLifeCategorySelect,
  onDemoSceneSelect,
  onCustomSceneChange,
  onToggleGoalChat,
  onCloseGoalChat,
  onNext,
  onBack,
}: StepSceneProps) {
  const customInputRef = useRef<HTMLTextAreaElement | null>(null);

  // 프로필 미완성 상태에서 카테고리를 골랐을 때 텍스트 인풋으로 즉시 안내
  const isProfileIncomplete = !gender || !personalityType || age === null;
  const shouldFocusCustom =
    !!selectedLifeCategory && isProfileIncomplete && !customSceneInput && !selectedDemoScene;

  useEffect(() => {
    if (shouldFocusCustom) {
      customInputRef.current?.focus();
    }
  }, [shouldFocusCustom]);

  // scene text 길이 검증 — 사용자가 텍스트 입력에 의존할 때만 검사
  const trimmedCustom = customSceneInput.trim();
  const customTooShort = trimmedCustom.length > 0 && trimmedCustom.length < SCENE_MIN_LENGTH;
  const customTooLong = trimmedCustom.length > SCENE_MAX_LENGTH;
  const hasValidSelection = !!selectedDemoScene || (trimmedCustom.length >= SCENE_MIN_LENGTH && !customTooLong);
  const nextDisabled = isSubmitting || !hasValidSelection;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
        <p className="text-sm text-foreground/60">나의 시간</p>
        <p className="text-base font-semibold">
          {lifeClock ? `당신의 시간은 ${lifeClock.label}이에요.` : "당신의 시간을 알려주세요"}
        </p>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold">내가 원하는게 뭘까요?</h2>
      </div>

      {/* 카테고리 6개 카드 — 모바일 2열, sm↑ 3열 */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground/60">
          하나만 선택할 수 있어요. 마음이 1%라도 더 기우는 쪽으로!
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          {getDemoScenes({
            category: sceneCategory,
            lifeCategory: selectedLifeCategory,
            age,
            gender,
            personalityType,
          }).map((item) => (
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

      {/* 프로필 미완성 안내 — 카테고리는 골랐지만 추천을 띄울 수 없을 때 */}
      {selectedLifeCategory && isProfileIncomplete && (
        <p className="rounded-lg bg-foreground/[0.04] px-3 py-2 text-xs leading-relaxed text-foreground/70">
          프로필 정보가 아직이라 추천을 보여드릴 수 없어요. 아래에 직접 입력해 보세요.
        </p>
      )}

      {/* 직접 입력 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="custom_scene" className="text-sm font-medium text-foreground/70">
            직접 입력 ✏️
          </label>
          <span
            className={cn(
              "text-xs",
              customTooLong ? "text-red-500" : "text-foreground/40"
            )}
          >
            {trimmedCustom.length}/{SCENE_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="custom_scene"
          ref={customInputRef}
          value={customSceneInput}
          onChange={(e) => onCustomSceneChange(e.target.value)}
          placeholder="예: 부모님과 여행 가기"
          rows={3}
          maxLength={SCENE_MAX_LENGTH + 20} // 살짝 여유를 두고 카운터로만 안내(즉시 잘리지 않음)
          aria-invalid={customTooShort || customTooLong}
          className="min-h-[88px] w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-3 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
        {customTooShort && (
          <p className="text-xs text-red-500">
            최소 {SCENE_MIN_LENGTH}자 이상 적어주세요.
          </p>
        )}
        {customTooLong && (
          <p className="text-xs text-red-500">
            너무 길어요. 더 짧게 적어주세요 ({SCENE_MAX_LENGTH}자 이내).
          </p>
        )}
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
          <p className="mb-1 text-xs text-foreground/50">선택한 장면</p>
          <p className="text-sm font-medium">{selectedSceneText}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        {isProfileStep && (
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            className="flex-1"
            disabled={isSubmitting}
          >
            이전
          </Button>
        )}
        <Button type="button" onClick={onNext} className="flex-1" disabled={nextDisabled}>
          {isSubmitting ? "분석 중..." : "다음"}
        </Button>
      </div>
    </div>
  );
}
