// 일기 AI 분석 (서버 전용) — 현재 일기 1건을 organize(요약·글쓰기 개선 등)한다.
//
// 저장하지 않는 읽기 전용 응답. AI 호출은 서버(액션)에서만 수행한다(CLAUDE.md).
// 프롬프트 정의는 diary-prompts.ts, 에러 처리는 analyze.ts 패턴을 따른다.

import { geminiModel } from "./gemini";
import { mapGeminiError } from "./analyze";
import { buildDiaryPrompt, type DiaryOrganizeMode } from "./diary-prompts";
import { AI_ERRORS, DIARY_ERRORS } from "@/lib/constants";

export interface AnalyzeDiaryInput {
  /** 일기 본문(순수 텍스트). */
  content: string;
  /** organize 모드(정해진 지시문). 없으면 question 사용. */
  mode?: DiaryOrganizeMode;
  /** 사용자의 자유 질문. mode가 없을 때 사용. */
  question?: string;
  /** 사용자가 드래그로 특히 주목한 부분(선택). */
  selection?: string;
}

// 프롬프트 폭주 방지용 상한 (토큰·비용 보호)
const MAX_CONTENT = 8000;
const MAX_SELECTION = 2000;
const MAX_QUESTION = 500;
/** AI 응답 대기 상한 — 플랫폼 함수 한도(maxDuration 60초)보다 넉넉히 앞서 끊는다 */
const AI_TIMEOUT_MS = 45_000;

/**
 * 일기를 읽고 organize 요청(모드 또는 자유 질문)에 한국어 텍스트로 답한다.
 * 결과는 마크다운 표제 없는 자연스러운 문단(단발 응답).
 */
export async function analyzeDiary(input: AnalyzeDiaryInput): Promise<string> {
  const content = input.content.trim().slice(0, MAX_CONTENT);
  if (!content) throw new Error(DIARY_ERRORS.CONTENT_REQUIRED);

  const selection = (input.selection ?? "").trim().slice(0, MAX_SELECTION);
  const question = (input.question ?? "").trim().slice(0, MAX_QUESTION);

  const prompt = buildDiaryPrompt({
    content,
    selection,
    mode: input.mode,
    question,
  });

  try {
    // 타임아웃을 우리가 건다. 없으면 플랫폼이 함수를 끊어 **응답 자체가 사라지고**,
    // 클라이언트에서는 이유 없는 실패로 보인다(서버액션 promise reject).
    const result = await Promise.race([
      geminiModel.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(AI_ERRORS.TIMEOUT)), AI_TIMEOUT_MS)
      ),
    ]);
    const text = result.response.text().trim();
    if (!text) throw new Error("");
    return text;
  } catch (error) {
    // 타임아웃 문구는 그대로 올린다(mapGeminiError를 타면 generic으로 뭉개진다)
    if (error instanceof Error && error.message === AI_ERRORS.TIMEOUT) throw error;
    throw mapGeminiError(error);
  }
}
