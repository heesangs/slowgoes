"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FEATURE_NAMES } from "@/lib/constants";
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
  selectedSceneText: string;
  isProfileStep: boolean;
  error: string | null;
  /** AI 분석 진행 여부 — true면 다음 버튼 disabled */
  isSubmitting?: boolean;
  onLifeCategorySelect: (key: LifeCategory) => void;
  onDemoSceneSelect: (item: DemoSceneItem) => void;
  onCustomSceneChange: (value: string) => void;
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
  selectedSceneText,
  isProfileStep,
  error,
  isSubmitting = false,
  onLifeCategorySelect,
  onDemoSceneSelect,
  onCustomSceneChange,
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
      <div className="rounded-xl border border-line-alt bg-fill-alt px-4 py-3">
        <p className="text-sm text-label-alt">{FEATURE_NAMES.MY_CLOCK}</p>
        <p className="text-base font-bold">
          {lifeClock ? `${FEATURE_NAMES.MY_CLOCK}은 ${lifeClock.label}이에요.` : `${FEATURE_NAMES.MY_CLOCK}을 알려주세요`}
        </p>
      </div>

      <div>
        <h2 className="mb-1 text-base font-bold">내가 원하는게 뭘까요?</h2>
      </div>

      {/* 카테고리 6개 카드 — 모바일 2열, sm↑ 3열 */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-label-alt">
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
                    ? "border-inverse-background bg-inverse-background text-inverse-label"
                    : "border-line-normal hover:bg-fill-alt"
                )}
              >
                <span className="text-2xl">{cat.icon}</span>
                <p className="mt-2 text-sm font-bold">{cat.label}</p>
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    isSelected ? "text-background/80" : "text-label-alt"
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
                  ? "border-inverse-background bg-inverse-background text-inverse-label"
                  : "border-line-normal hover:bg-fill-alt"
              )}
            >
              {item.text}
            </button>
          ))}
        </div>
      )}

      {/* 프로필 미완성 안내 — 카테고리는 골랐지만 추천을 띄울 수 없을 때 */}
      {selectedLifeCategory && isProfileIncomplete && (
        <p className="rounded-lg bg-fill-alt px-3 py-2 text-xs leading-relaxed text-label-alt">
          프로필 정보가 아직이라 추천을 보여드릴 수 없어요. 아래에 직접 입력해 보세요.
        </p>
      )}

      {/* 직접 입력 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="custom_scene" className="text-sm font-medium text-label-alt">
            직접 입력 ✏️
          </label>
          <span
            className={cn(
              "text-xs",
              customTooLong ? "text-danger" : "text-label-assistive"
            )}
          >
            {trimmedCustom.length}/{SCENE_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id="custom_scene"
          ref={customInputRef}
          value={customSceneInput}
          onChange={(e) => onCustomSceneChange(e.target.value)}
          placeholder="예: 부모님과 여행 가기"
          rows={3}
          maxLength={SCENE_MAX_LENGTH + 20} // 살짝 여유를 두고 카운터로만 안내(즉시 잘리지 않음)
          aria-invalid={customTooShort || customTooLong}
          className="min-h-[88px]"
        />
        {customTooShort && (
          <p className="text-xs text-danger">
            최소 {SCENE_MIN_LENGTH}자 이상 적어주세요.
          </p>
        )}
        {customTooLong && (
          <p className="text-xs text-danger">
            너무 길어요. 더 짧게 적어주세요 ({SCENE_MAX_LENGTH}자 이내).
          </p>
        )}
      </div>

      {selectedSceneText && (
        <div className="rounded-lg border border-line-alt bg-fill-alt px-4 py-3">
          <p className="mb-1 text-xs text-label-alt">선택한 장면</p>
          <p className="text-sm font-medium">{selectedSceneText}</p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {isProfileStep && (
          <Button
            type="button"
            variant="line"
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
