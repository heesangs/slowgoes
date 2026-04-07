"use server";

import {
  adjustPacePlan,
  analyzeLifeScene,
  generateFirstStep,
} from "@/lib/ai/analyze";
import type {
  FirstStepPlanResult,
  Gender,
  LifeSceneAnalysisResult,
  PaceAdjustOption,
  PersonalityType,
} from "@/types";

function toClientErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message?.trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();
  if (
    lower.includes("googlegenerativeai") ||
    lower.includes("generativelanguage.googleapis.com")
  ) {
    return "AI 서비스 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (message.length > 180) {
    return fallback;
  }

  return message;
}

export async function demoAnalyzeLifeSceneAction(data: {
  sceneText: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
}): Promise<{
  success: boolean;
  data?: LifeSceneAnalysisResult;
  error?: string;
}> {
  try {
    const sceneText = data.sceneText?.trim();
    if (!sceneText) {
      throw new Error("삶의 장면을 입력해주세요.");
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error("나이 값이 올바르지 않습니다.");
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error("성별 값이 올바르지 않습니다.");
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error("성향 값이 올바르지 않습니다.");
    }

    const analysis = await analyzeLifeScene({
      sceneText,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
    });

    return { success: true, data: analysis };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "삶의 장면 분석 중 오류가 발생했습니다."),
    };
  }
}

export async function demoGenerateFirstStepAction(data: {
  weeklyAction: string;
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
}): Promise<{
  success: boolean;
  data?: FirstStepPlanResult;
  error?: string;
}> {
  try {
    const weeklyAction = data.weeklyAction?.trim();
    const sceneText = data.sceneText?.trim();
    const lifeArea = data.lifeArea?.trim();

    if (!weeklyAction) {
      throw new Error("이번 주 행동을 선택해주세요.");
    }
    if (!sceneText) {
      throw new Error("삶의 장면이 비어 있습니다.");
    }
    if (!lifeArea) {
      throw new Error("삶의 영역 정보가 비어 있습니다.");
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error("나이 값이 올바르지 않습니다.");
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error("성별 값이 올바르지 않습니다.");
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error("성향 값이 올바르지 않습니다.");
    }

    const plan = await generateFirstStep({
      weeklyAction,
      sceneText,
      lifeArea,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
    });

    return { success: true, data: plan };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "첫 실행안 생성 중 오류가 발생했습니다."),
    };
  }
}

export async function demoAdjustPaceAction(data: {
  option: PaceAdjustOption;
  weeklyAction: string;
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
  currentPlan: FirstStepPlanResult;
}): Promise<{
  success: boolean;
  data?: FirstStepPlanResult;
  error?: string;
}> {
  try {
    const option = data.option;
    const weeklyAction = data.weeklyAction?.trim();
    const sceneText = data.sceneText?.trim();
    const lifeArea = data.lifeArea?.trim();

    if (!["lighter", "more_specific", "once_per_week", "start_this_week", "start_today"].includes(option)) {
      throw new Error("페이스 옵션 값이 올바르지 않습니다.");
    }
    if (!weeklyAction) {
      throw new Error("이번 주 행동을 선택해주세요.");
    }
    if (!sceneText) {
      throw new Error("삶의 장면이 비어 있습니다.");
    }
    if (!lifeArea) {
      throw new Error("삶의 영역 정보가 비어 있습니다.");
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error("나이 값이 올바르지 않습니다.");
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error("성별 값이 올바르지 않습니다.");
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error("성향 값이 올바르지 않습니다.");
    }
    if (!data.currentPlan || !Array.isArray(data.currentPlan.subtasks)) {
      throw new Error("현재 실행안 정보가 올바르지 않습니다.");
    }

    if (option !== "more_specific") {
      return { success: true, data: data.currentPlan };
    }

    const adjustedPlan = await adjustPacePlan({
      option,
      weeklyAction,
      sceneText,
      lifeArea,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
      currentPlan: data.currentPlan,
    });

    return { success: true, data: adjustedPlan };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "페이스 조정 중 오류가 발생했습니다."),
    };
  }
}
