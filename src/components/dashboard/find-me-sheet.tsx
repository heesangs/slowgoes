"use client";

// "숨은 나 찾기" 시트 — 메인 대시보드 + 버튼의 단일 진입점.
//
// 두 가지 모드를 한 시트 안에서 스위칭 (DEVELOPER.md "14c" 2번 "얕은 인터랙션 깊이"):
//  - "내 버킷": 기존 버킷 카드 목록. 클릭 시 그 버킷으로 전환만 하고 시트 닫힘.
//    (구 메인의 셀렉트 박스 + 별도 페이지 /buckets 가 이 모드로 흡수됨)
//  - "새 장면 탐색": OnboardingForm Step 2~4. 새 버킷 + 첫 항목 생성.
//
// 진입 기본 모드:
//  - 기존 버킷이 0개면 'explore' (새 사용자 — 먼저 만들기)
//  - 1개 이상이면 'select' (기존 사용자 — 먼저 전환을 권장)

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { FEATURE_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Bucket, Gender, PaceType, PersonalityType } from "@/types";

type FindMeMode = "select" | "explore";

interface FindMeSheetProps {
  open: boolean;
  onClose: () => void;
  /** 메인에서 전환 가능한 기존 버킷 목록 */
  buckets: Array<Pick<Bucket, "id" | "title">>;
  /** 현재 선택된 버킷 id — 카드의 "현재" 표시용 */
  selectedBucketId: string | null;
  /** Step 2 진입 시 프로필 자동 채움 */
  prefillProfile: {
    age: number;
    gender: Gender;
    personalityType: PersonalityType;
    paceType?: PaceType;
  } | null;
  /** 새 장면 탐색 흐름이 끝난 뒤 토스트/refresh — onComplete 트리거 */
  onExplorationComplete: () => void;
}

export function FindMeSheet({
  open,
  onClose,
  buckets,
  selectedBucketId,
  prefillProfile,
  onExplorationComplete,
}: FindMeSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialMode: FindMeMode = buckets.length > 0 ? "select" : "explore";
  const [mode, setMode] = useState<FindMeMode>(initialMode);

  // 시트가 닫히면 다음 진입 시 항상 기본 모드로 시작
  useEffect(() => {
    if (!open) {
      setMode(initialMode);
    }
    // initialMode는 buckets.length에 의존 — 사용자가 시트 안에서 새로 만들면
    // 다음 진입 시 자동으로 select로 전환되도록 하기 위함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, buckets.length]);

  // PR 32: 버킷 전환 즉각 시각 피드백 + 히스토리 오염 방지
  // - useTransition: 클릭 즉시 isPending=true → 카드 dimming
  // - router.replace: 매 버킷 전환마다 history 쌓이지 않음 (뒤로가기 자연스러움)
  function handleSelectBucket(bucketId: string) {
    onClose();
    startTransition(() => {
      router.replace(`/dashboard?bucket=${bucketId}`);
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={FEATURE_NAMES.FIND_ME} size="large">
      {/* 모드 토글 — 기존 버킷이 있을 때만 노출 */}
      {buckets.length > 0 && (
        <div className="mb-4 inline-flex rounded-lg bg-foreground/[0.05] p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("select")}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              mode === "select" ? "bg-background shadow-sm" : "text-foreground/60 hover:text-foreground"
            )}
          >
            내 {FEATURE_NAMES.BUCKET}
          </button>
          <button
            type="button"
            onClick={() => setMode("explore")}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              mode === "explore" ? "bg-background shadow-sm" : "text-foreground/60 hover:text-foreground"
            )}
          >
            새 장면 탐색
          </button>
        </div>
      )}

      {mode === "select" && buckets.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground/60">
            전환할 {FEATURE_NAMES.BUCKET}을 선택해 주세요.
          </p>
          {buckets.map((bucket) => {
            const isCurrent = bucket.id === selectedBucketId;
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() => handleSelectBucket(bucket.id)}
                disabled={isPending}
                aria-current={isCurrent ? "true" : undefined}
                aria-busy={isPending}
                className={cn(
                  "min-h-[56px] rounded-lg border px-4 py-3 text-left transition-all",
                  isCurrent
                    ? "border-foreground bg-foreground/[0.05]"
                    : "border-foreground/15 hover:bg-foreground/5",
                  isPending && "opacity-50"
                )}
              >
                <p className="text-sm font-semibold">{bucket.title}</p>
                {isCurrent && (
                  <p className="mt-0.5 text-xs text-foreground/60">현재 보고 있어요</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {mode === "explore" && (
        <OnboardingForm
          startStep={2}
          prefillProfile={prefillProfile}
          sessionKey="slowgoes_dashboard_exploration_v1"
          onComplete={onExplorationComplete}
        />
      )}
    </BottomSheet>
  );
}
