"use client";

// 체험판 데이터 마이그레이션 — 온보딩 페이지 진입 시 localStorage 데이터를 DB로 자동 저장

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  clearAllDemoOnboardingData,
  getDemoOnboardingBackupData,
  getDemoOnboardingData,
  saveDemoOnboardingBackupData,
} from "@/lib/demo/storage";
import { saveOnboardingV2ForMigrationAction } from "@/app/(auth)/actions";

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

      const result = await saveOnboardingV2ForMigrationAction({
        sceneText: demoData.sceneText,
        lifeArea: demoData.lifeArea,
        age: demoData.age,
        gender: demoData.gender,
        personalityType: demoData.personalityType,
        paceType: demoData.paceType,
        displayName: demoData.displayName || "slowgoes 사용자",
        selfLevel: demoData.selfLevel,
        chapterTitle: demoData.chapterTitle,
        stridePlan: demoData.stridePlan,
        selectedDailyTodos: demoData.selectedDailyTodos,
        selectedRoutines: demoData.selectedRoutines,
      });

      if (!result.success) {
        setError(result.error ?? "체험판 데이터 저장에 실패했어요. 다시 시도해주세요.");
        setMigrating(false);
        return;
      }

      clearAllDemoOnboardingData();
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
        <p className="text-sm text-foreground/60">
          체험판 데이터를 불러오는 중...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
          <p className="text-sm font-medium text-red-600">
            체험 데이터를 자동으로 옮기지 못했어요.
          </p>
          <p className="mt-1 text-xs text-red-600/90">{error}</p>
          <Button type="button" variant="secondary" className="mt-3 w-full" onClick={handleRetry}>
            다시 시도
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
