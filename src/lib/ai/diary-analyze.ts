// 일기 AI 분석 (서버 전용) — 현재 일기 1건을 대상으로 요약·조언을 생성한다.
//
// 저장하지 않는 읽기 전용 조언. AI 호출은 서버(액션)에서만 수행한다(CLAUDE.md).
// 프롬프트·에러 처리 패턴은 analyze.ts를 따른다.

import { geminiModel } from "./gemini";
import { mapGeminiError } from "./analyze";
import { DIARY_ERRORS } from "@/lib/constants";

export interface AnalyzeDiaryInput {
  /** 일기 본문(순수 텍스트). */
  content: string;
  /** 사용자의 요청/질문. 비우면 요약. */
  question?: string;
  /** 사용자가 드래그로 특히 주목한 부분(선택). */
  selection?: string;
}

// 프롬프트 폭주 방지용 상한 (토큰·비용 보호)
const MAX_CONTENT = 8000;
const MAX_SELECTION = 2000;
const MAX_QUESTION = 500;

/**
 * 일기를 읽고 사용자의 요청(요약 또는 자유 질문)에 한국어 조언 텍스트로 답한다.
 * 결과는 마크다운 표제 없는 자연스러운 문단(단발 응답).
 */
export async function analyzeDiary(input: AnalyzeDiaryInput): Promise<string> {
  const content = input.content.trim().slice(0, MAX_CONTENT);
  if (!content) throw new Error(DIARY_ERRORS.CONTENT_REQUIRED);

  const selection = (input.selection ?? "").trim().slice(0, MAX_SELECTION);
  const question = (input.question ?? "").trim().slice(0, MAX_QUESTION);

  const prompt = `당신은 사용자의 일기를 함께 돌아보는 따뜻하고 담백한 코치입니다.
아래 일기를 읽고 사용자의 요청에 답하세요.

[일기 전문]
${content}
${selection ? `\n[사용자가 특히 주목한 부분]\n${selection}\n` : ""}
[사용자 요청]
${question || "이 일기를 3~4문장으로 부드럽게 요약해줘."}

규칙:
- 한국어로, 따뜻하지만 담백하게. 과장된 위로·상투구·이모지는 쓰지 않는다.
- 훈계·단정 대신 관찰과 열린 질문 위주로. 도움이 되면 실천 가능한 제안을 1~2개만.
- 일기에 없는 사실을 지어내지 않는다. 선택한 부분이 있으면 그 맥락을 우선한다.
- 5~8문장 이내. 마크다운 표제 없이 자연스러운 문단으로만 답한다.`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text().trim();
    if (!text) throw new Error("");
    return text;
  } catch (error) {
    throw mapGeminiError(error);
  }
}
