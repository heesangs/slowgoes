"use server";

// 체험판(/demo) 전용 server actions.
//
// PR 5 정리: demoGenerateFirstStepAction / demoAdjustPaceAction은 v1 온보딩
// Step 4(첫 실행안 구체화)용이었고 호출처가 0이라 함께 폐기. 현재 demo는
// 장면 분석(analyzeLifeScene)까지만 server에서 수행하고 결과를 localStorage에
// 저장하는 흐름이다.

import { analyzeLifeScene } from "@/lib/ai/analyze";
import { AI_ERRORS, VALIDATION_ERRORS } from "@/lib/constants";
import type {
  Gender,
  LifeSceneAnalysisResult,
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
