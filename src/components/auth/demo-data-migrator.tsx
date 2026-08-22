"use client";

// 체험판 데이터 마이그레이션 — 온보딩 페이지 진입 시 localStorage 데이터를 DB로 자동 저장

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/error-box";
import {
  clearAllDemoOnboardingData,
  getDemoOnboardingBackupData,
  getDemoOnboardingData,
  saveDemoOnboardingBackupData,
} from "@/lib/demo/storage";
import { saveOnboardingV2NoRedirectAction } from "@/app/(auth)/actions";
import { DEMO_DRAFT_SESSION_KEY } from "@/components/auth/onboarding/constants";

const DEMO_MIGRATION_LOCK_KEY = "slowgoes_demo_migration_lock_v1";
const DEMO_MIGRATION_LOCK_STALE_MS = 30_000;

function tryAcquireMigrationLock() {
  if (typeof window === "undefined") return true;

  const now = Date.now();
  const raw = sessionStorage.getItem(DEMO_MIGRATION_LOCK_KEY);
  if (raw) {
    const lockedAt = Number(raw);
    if (Number.isFinite(lockedAt) && now - lockedAt < DEMO_MIGRATION_LOCK_STALE_MS) {
      return false;
    }
  }

  sessionStorage.setItem(DEMO_MIGRATION_LOCK_KEY, String(now));
  return true;
}

function releaseMigrationLock() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DEMO_MIGRATION_LOCK_KEY);
}

interface DemoDataMigratorProps {
  children: React.ReactNode;
}

export function DemoDataMigrator({ children }: DemoDataMigratorProps) {
  const router = useRouter();
  const [migrating, setMigrating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasAttemptedRef = useRef(false);

  const migrate = useCallback(async () => {
    setError(null);

    const demoData = getDemoOnboardingData() ?? getDemoOnboardingBackupData();
    if (!demoData) {
      setMigrating(false);
      return;
    }

    if (!tryAcquireMigrationLock()) {
      setMigrating(false);
      return;
    }

    try {
      // 원본이 손상되어도 복구할 수 있도록 마이그레이션 직전에 백업
      saveDemoOnboardingBackupData(demoData);

      const result = await saveOnboardingV2NoRedirectAction({
        sceneText: demoData.sceneText,
        lifeArea: demoData.lifeArea,
        age: demoData.age,
        gender: demoData.gender,
        personalityType: demoData.personalityType,
        // 생활 속도는 더 이상 묻지 않는다 — 컬럼 호환을 위해 기본값만 넣는다
        paceType: "balanced",
        displayName: demoData.displayName || "slowgoes 사용자",
        chapterTitle: demoData.chapterTitle,
        stridePlan: demoData.stridePlan,
        selectedDailyTodos: demoData.selectedDailyTodos,
        // 예전 체험 데이터에 루틴이 남아 있으면 그대로 살려 준다(사용자가 이미 고른 것)
        selectedRoutines: demoData.selectedRoutines ?? [],
      });

      if (!result.success) {
        setError(result.error ?? "체험판 데이터 저장에 실패했어요. 다시 시도해주세요.");
        setMigrating(false);
        return;
      }

      clearAllDemoOnboardingData();
      // 진행 중 draft도 함께 정리 — 여기까지 왔으면 DB에 안전하게 들어갔다.
      // 남겨 두면 다음에 체험판을 열었을 때 이미 끝난 흐름이 되살아난다.
      try {
        sessionStorage.removeItem(DEMO_DRAFT_SESSION_KEY);
      } catch {
        // sessionStorage 접근 불가 시 무시
      }
      router.replace("/dashboard?onboarding_saved=1");
      return;
    } catch {
      setError("체험판 데이터 저장 중 오류가 발생했어요. 다시 시도해주세요.");
      setMigrating(false);
    } finally {
      releaseMigrationLock();
    }
  }, [router]);

  useEffect(() => {
    if (hasAttemptedRef.current) return;
    hasAttemptedRef.current = true;
    void migrate();
  }, [migrate]);

  function handleRetry() {
    setMigrating(true);
    void migrate();
  }

  if (migrating) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-foreground/70">
          체험판 데이터를 불러오는 중...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBox as="div">
          <p className="font-medium">
            체험 데이터를 자동으로 옮기지 못했어요.
          </p>
          <p className="mt-1 text-xs text-danger/90">{error}</p>
          <Button type="button" variant="secondary" className="mt-3 w-full" onClick={handleRetry}>
            다시 시도
          </Button>
        </ErrorBox>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
