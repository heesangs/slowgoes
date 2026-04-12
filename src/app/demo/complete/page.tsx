"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clearDemoOnboardingData,
  getDemoOnboardingData,
  type DemoOnboardingData,
} from "@/lib/demo/storage";
import { cn } from "@/lib/utils";

function formatRoutineRepeat(unit: DemoOnboardingData["selectedRoutines"][number]["repeatUnit"], value: number) {
  if (unit === "daily") {
    return value <= 1 ? "매일" : `${value}일마다`;
  }
  return value <= 1 ? "매주" : `${value}주마다`;
}

export default function DemoCompletePage() {
  const router = useRouter();
  const [result, setResult] = useState<DemoOnboardingData | null>(null);

  useEffect(() => {
    // localStorage는 마운트 이후에만 접근 가능 — hydration mismatch 방지용으로 의도적으로 effect 사용
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(getDemoOnboardingData());
  }, []);

  function handleRetry() {
    clearDemoOnboardingData();
    router.push("/demo");
  }

  if (!result) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-xl border border-foreground/15 p-6 text-center">
          <h1 className="text-xl font-semibold">체험 결과가 없어요</h1>
          <p className="mt-2 text-sm text-foreground/60">
            온보딩 체험을 먼저 진행해주세요.
          </p>
          <Button type="button" className="mt-6 w-full" onClick={handleRetry}>
            다시 체험하기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] p-5">
          <p className="text-xs font-medium text-foreground/60">체험 결과 요약</p>
          <h1 className="mt-1 text-xl font-semibold">{result.sceneText}</h1>
          <p className="mt-2 text-sm text-foreground/70">
            삶의 영역: {result.lifeArea}
          </p>
          <p className="mt-1 text-sm text-foreground/70">
            공감 메시지: {result.stridePlan.empathyMessage}
          </p>
        </div>

        <div className="rounded-xl border border-foreground/10 p-5">
          <p className="text-sm font-medium">데일리투두</p>
          <div className="mt-3 space-y-2">
            {result.selectedDailyTodos.length > 0 ? (
              result.selectedDailyTodos.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3"
                >
                  <p className="text-sm font-medium">{item.title}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-foreground/60">선택된 데일리투두가 없어요.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-foreground/10 p-5">
          <p className="text-sm font-medium">루틴</p>
          <div className="mt-3 space-y-2">
            {result.selectedRoutines.length > 0 ? (
              result.selectedRoutines.map((routine, index) => (
                <div
                  key={`${routine.title}-${index}`}
                  className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-3"
                >
                  <p className="text-sm font-medium">{routine.title}</p>
                  <p className="mt-1 text-xs text-foreground/60">
                    반복: {formatRoutineRepeat(routine.repeatUnit, routine.repeatValue)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-foreground/60">선택된 루틴이 없어요.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-foreground/10 p-5">
          <p className="text-sm font-medium">나의 보폭</p>
          <div className="mt-3 space-y-2">
            {result.stridePlan.strides.map((item, index) => (
              <div
                key={`${item.level}-${index}-${item.action}`}
                className={cn(
                  "rounded-lg border px-3 py-3",
                  // 첫 항목(AI가 정렬한 가장 짧은 단계)을 강조
                  index === 0
                    ? "border-foreground/25 bg-foreground/[0.08]"
                    : "border-foreground/10 bg-foreground/[0.02]"
                )}
              >
                <p className="text-xs text-foreground/60">{item.label}</p>
                <p className="mt-0.5 text-sm">{item.action}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-foreground px-4 py-2 text-base font-medium text-background transition-opacity hover:opacity-90"
          >
            회원가입하고 계속하기
          </Link>
          <Button type="button" variant="secondary" className="w-full" onClick={handleRetry}>
            다시 체험하기
          </Button>
        </div>
      </div>
    </div>
  );
}
