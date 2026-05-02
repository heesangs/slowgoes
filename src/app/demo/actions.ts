"use server";

import {
  adjustPacePlan,
  analyzeLifeScene,
  generateFirstStep,
} from "@/lib/ai/analyze";
import {
  AI_ERRORS,
  VALIDATION_ERRORS,
} from "@/lib/constants";
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
    return AI_ERRORS.SERVICE_ERROR;
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
  lifeAreaHint?: string | null;
}): Promise<{
  success: boolean;
  data?: LifeSceneAnalysisResult;
  error?: string;
}> {
  try {
    const sceneText = data.sceneText?.trim();
    if (!sceneText) {
      throw new Error(VALIDATION_ERRORS.SCENE_TEXT_REQUIRED);
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error(VALIDATION_ERRORS.AGE_INVALID);
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error(VALIDATION_ERRORS.GENDER_INVALID);
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error(VALIDATION_ERRORS.PERSONALITY_INVALID);
    }

    const analysis = await analyzeLifeScene({
      sceneText,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
      lifeAreaHint: data.lifeAreaHint ?? null,
    });

    return { success: true, data: analysis };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, AI_ERRORS.SCENE_ANALYSIS_ERROR),
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
      throw new Error(VALIDATION_ERRORS.WEEKLY_ACTION_REQUIRED);
    }
    if (!sceneText) {
      throw new Error(VALIDATION_ERRORS.SCENE_TEXT_EMPTY);
    }
    if (!lifeArea) {
      throw new Error(VALIDATION_ERRORS.LIFE_AREA_EMPTY);
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error(VALIDATION_ERRORS.AGE_INVALID);
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error(VALIDATION_ERRORS.GENDER_INVALID);
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error(VALIDATION_ERRORS.PERSONALITY_INVALID);
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
      error: toClientErrorMessage(error, AI_ERRORS.FIRST_STEP_ERROR),
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
      throw new Error(VALIDATION_ERRORS.PACE_OPTION_INVALID);
    }
    if (!weeklyAction) {
      throw new Error(VALIDATION_ERRORS.WEEKLY_ACTION_REQUIRED);
    }
    if (!sceneText) {
      throw new Error(VALIDATION_ERRORS.SCENE_TEXT_EMPTY);
    }
    if (!lifeArea) {
      throw new Error(VALIDATION_ERRORS.LIFE_AREA_EMPTY);
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error(VALIDATION_ERRORS.AGE_INVALID);
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error(VALIDATION_ERRORS.GENDER_INVALID);
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error(VALIDATION_ERRORS.PERSONALITY_INVALID);
    }
    if (!data.currentPlan || !Array.isArray(data.currentPlan.subtasks)) {
      throw new Error(VALIDATION_ERRORS.CURRENT_PLAN_INVALID);
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
      error: toClientErrorMessage(error, AI_ERRORS.PACE_ADJUST_ERROR),
    };
  }
}
