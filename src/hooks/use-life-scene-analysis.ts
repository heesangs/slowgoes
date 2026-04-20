"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzeLifeSceneAction } from "@/app/(auth)/actions";
import { demoAnalyzeLifeSceneAction } from "@/app/demo/actions";
import { partitionStrides } from "@/lib/ai/analyze";
import type { Gender, LifeSceneAnalysisResult, PersonalityType } from "@/types";

interface UseLifeSceneAnalysisParams {
  isDemo: boolean;
  step: number;
  age: number | null;
  gender: Gender | null;
  personalityType: PersonalityType | null;
  selectedSceneText: string;
  setError: (error: string | null) => void;
}

export function useLifeSceneAnalysis({
  isDemo,
  step,
  age,
  gender,
  personalityType,
  selectedSceneText,
  setError,
}: UseLifeSceneAnalysisParams) {
  const [lifeSceneAnalysis, setLifeSceneAnalysis] = useState<LifeSceneAnalysisResult | null>(null);
  const [isAnalyzingLifeScene, setIsAnalyzingLifeScene] = useState(false);
  const [selectedDailyTodo, setSelectedDailyTodo] = useState("");
  const [selectedRoutineTitles, setSelectedRoutineTitles] = useState<string[]>([]);
  const [step3AnalysisKey, setStep3AnalysisKey] = useState<string | null>(null);

  const step3RequestKey =
    age !== null && gender && personalityType && selectedSceneText
      ? `${selectedSceneText}|${age}|${gender}|${personalityType}`
      : null;

  const { displayStrides, bucketTodos } = useMemo(() => {
    if (!lifeSceneAnalysis) return { displayStrides: [], bucketTodos: [] };
    return partitionStrides(lifeSceneAnalysis.strides);
  }, [lifeSceneAnalysis]);

  // 시즌 액션(있으면) — 챕터 제목 fallback 용
  const selectedSeasonAction =
    lifeSceneAnalysis?.strides.find((item) => item.level === "this_season")?.action ?? "";

  function resetAnalysisState() {
    setLifeSceneAnalysis(null);
    setSelectedDailyTodo("");
    setSelectedRoutineTitles([]);
    setStep3AnalysisKey(null);
  }

  function selectRoutineTitle(title: string) {
    setSelectedRoutineTitles([title]);
  }

  const runLifeSceneAnalysis = useCallback(
    async (force = false) => {
      if (!step3RequestKey || age === null || !gender || !personalityType) return;
      if (!force && step3AnalysisKey === step3RequestKey && lifeSceneAnalysis) return;

      setIsAnalyzingLifeScene(true);
      setError(null);
      if (force) {
        setLifeSceneAnalysis(null);
        setSelectedDailyTodo("");
        setSelectedRoutineTitles([]);
      }

      const result = await (isDemo
        ? demoAnalyzeLifeSceneAction({ sceneText: selectedSceneText, age, gender, personalityType })
        : analyzeLifeSceneAction({ sceneText: selectedSceneText, age, gender, personalityType }));

      if (!result.success || !result.data) {
        setError(result.error ?? "삶의 장면 분석 중 오류가 발생했습니다.");
        setIsAnalyzingLifeScene(false);
        return;
      }

      const analysis = result.data;
      const { bucketTodos: todos } = partitionStrides(analysis.strides);
      const firstTodoAction = todos[0]?.action ?? "";

      setLifeSceneAnalysis(analysis);
      setStep3AnalysisKey(step3RequestKey);
      setSelectedDailyTodo((prev) => (prev && prev === firstTodoAction ? prev : firstTodoAction));
      setSelectedRoutineTitles((prev) => {
        const available = analysis.suggestedRoutines.map((item) => item.title);
        const filteredPrev = prev.filter((item) => available.includes(item));
        return filteredPrev.length > 0 ? filteredPrev : available.slice(0, 1);
      });
      setIsAnalyzingLifeScene(false);
    },
    [
      age,
      gender,
      isDemo,
      lifeSceneAnalysis,
      personalityType,
      selectedSceneText,
      step3AnalysisKey,
      step3RequestKey,
      setError,
    ]
  );

  useEffect(() => {
    if (step !== 3) return;
    if (!step3RequestKey) return;
    void runLifeSceneAnalysis(false);
  }, [step, step3RequestKey, runLifeSceneAnalysis]);

  return {
    lifeSceneAnalysis,
    setLifeSceneAnalysis,
    isAnalyzingLifeScene,
    selectedDailyTodo,
    setSelectedDailyTodo,
    selectedRoutineTitles,
    setSelectedRoutineTitles,
    step3AnalysisKey,
    setStep3AnalysisKey,
    displayStrides,
    bucketTodos,
    selectedSeasonAction,
    resetAnalysisState,
    selectRoutineTitle,
    runLifeSceneAnalysis,
  };
}
