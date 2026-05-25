"use client";

// IA v2 목표 3: FindMeSheet의 'explore' 책임만 분리한 시트.
//
// FindMeSheet은 select(버킷 전환) + explore(새 장면 탐색) 두 책임을 가졌으나,
// 목표 2의 BucketSwitcher 칩이 select 책임을 흡수하면서 explore 한 가지만 남았다.
//
// 진입점: BucketSwitcher의 `+` 칩 (메인 레이아웃에서 마운트) — IA v2 목표 3.
//
// 내부 흐름은 기존과 동일: OnboardingForm Step 2~4 재사용 + sessionStorage 보존.

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { FEATURE_NAMES } from "@/lib/constants";
import type { Gender, PaceType, PersonalityType } from "@/types";

interface ExploreNewSceneSheetProps {
  open: boolean;
  onClose: () => void;
  /** Step 2 진입 시 프로필 자동 채움 */
  prefillProfile: {
    age: number;
    gender: Gender;
    personalityType: PersonalityType;
    paceType?: PaceType;
  } | null;
  /** 새 장면 탐색 흐름이 끝난 뒤 토스트/refresh — onComplete 트리거 */
  onComplete: () => void;
}

export function ExploreNewSceneSheet({
  open,
  onClose,
  prefillProfile,
  onComplete,
}: ExploreNewSceneSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={FEATURE_NAMES.FIND_ME} size="large">
      <OnboardingForm
        startStep={2}
        prefillProfile={prefillProfile}
        sessionKey="slowgoes_dashboard_exploration_v1"
        onComplete={onComplete}
      />
    </BottomSheet>
  );
}
