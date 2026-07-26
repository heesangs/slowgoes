// 일기 organize 프롬프트 정의 (단일 기준).
//
// 각 모드의 label은 시트 버튼 텍스트이자 [comment] 코멘트 제목으로 재사용된다.
// instruction은 공통 래퍼(buildDiaryPrompt) 안에 주입되는 "이번 요청" 지시문이다.
// 규칙 문서는 aiprompt.md의 "일기 organize 모드" 섹션 참고(문서=규칙, 이 파일=구현).

export type DiaryOrganizeMode =
  | "summary"
  | "essay"
  | "flow"
  | "vocabulary"
  | "logic";

export const DIARY_ORGANIZE_MODES: Record<
  DiaryOrganizeMode,
  { label: string; instruction: string }
> = {
  summary: {
    label: "요약하기",
    instruction:
      "이 일기를 3~4문장으로 부드럽게 요약해줘. 핵심 사건과 감정의 흐름이 드러나게.",
  },
  essay: {
    label: "논술 관점에서 평가하기",
    instruction:
      "이 글을 '논술' 관점에서 구조적으로 평가해줘. 서론·본론·결론의 흐름, 중심 주제의 명료성, 주장과 근거의 연결이 잘 되어 있는지 짚고, 구조를 더 탄탄하게 만들 구체적 조언을 2~3개 제시해줘. 감상 위로가 아니라 글의 뼈대에 집중할 것.",
  },
  flow: {
    label: "문맥 어색한 부분 찾기",
    instruction:
      "문장과 문장 사이의 흐름이 어색하거나 연결이 끊기는 지점을 찾아줘. 해당 부분을 원문에서 짧게 인용하고, 왜 어색한지와 자연스럽게 잇는 대안 문장을 함께 제시해줘. 없으면 없다고 말해줘.",
  },
  vocabulary: {
    label: "어휘력 높이기",
    instruction:
      "반복적으로 쓰인 단어나 지나치게 평범한 표현을 찾아, 각각에 대해 문맥에 맞는 대체 단어·표현을 2~3개씩 추천해줘. '원래 표현 → 대안들' 형태로 간결하게. 글의 원래 톤을 해치지 않는 선에서.",
  },
  logic: {
    label: "논리적 빈틈 찾기",
    instruction:
      "자기 주장이나 철학적 생각이 담긴 부분에서 기승전결(도입·전개·전환·결론) 중 부족한 단계나 논리적 비약을 짚어줘. 어떤 전제가 생략됐는지, 어디서 결론이 근거보다 앞서 나갔는지 구체적으로 지적하고, 보완할 방향을 제안해줘. 단순 감상 일기라 해당 없으면 그렇게 말해줘.",
  },
};

export interface BuildDiaryPromptInput {
  /** 일기 본문(순수 텍스트) */
  content: string;
  /** 드래그로 선택한 부분(있으면 우선 맥락) */
  selection?: string;
  /** organize 모드 — 없으면 question 사용 */
  mode?: DiaryOrganizeMode;
  /** 자유 질문 — mode가 없을 때 사용 */
  question?: string;
}

/** organize 공통 프롬프트 조립 — mode(정해진 지시문) 또는 자유 question 중 하나를 요청으로 넣는다. */
export function buildDiaryPrompt(input: BuildDiaryPromptInput): string {
  const request = input.mode
    ? DIARY_ORGANIZE_MODES[input.mode].instruction
    : (input.question ?? "").trim() || DIARY_ORGANIZE_MODES.summary.instruction;

  const selectionBlock = input.selection?.trim()
    ? `\n[사용자가 특히 주목한 부분]\n${input.selection.trim()}\n`
    : "";

  return `당신은 사용자가 글을 더 잘 쓰도록 돕는 담백한 글쓰기 코치이자 일기 상담자입니다.
아래 일기를 읽고 사용자의 요청에 답하세요.

[일기 전문]
${input.content}
${selectionBlock}
[사용자 요청]
${request}

규칙:
- 한국어로, 따뜻하지만 담백하게. 과장된 위로·상투구·이모지는 쓰지 않는다.
- 일기(및 선택한 부분)에 실제로 있는 내용에 근거한다. 없는 사실을 지어내지 않는다.
- 지적할 때는 원문을 짧게 인용해 어디를 말하는지 분명히 하고, 개선 방향을 함께 준다.
- 마크다운 표제(#) 없이 자연스러운 문단으로. 항목이 여럿이면 짧은 줄바꿈으로 구분해도 좋다.
- 8문장 이내로 간결하게.`;
}
