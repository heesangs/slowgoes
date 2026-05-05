// 브랜드 및 서비스 내 기능 이름 상수
//
// 사용 가이드:
// - 사용자 노출 텍스트에서 핵심 용어를 쓸 때 한국어 리터럴 대신 `FEATURE_NAMES.*`를 import 하여 사용한다.
// - 용어를 바꿀 일이 생기면 이 파일에서만 수정하면 전 화면에 반영된다.
// - 자세한 가이드는 `DEVELOPER.md`의 "Brand Naming & FEATURE_NAMES" 섹션 참조.

export const APP = {
  NAME: "slowgoes",
  DEFAULT_USER_NAME: "slowgoes 사용자",
} as const;

export const FEATURE_NAMES = {
  MY_STRIDES: "나의 발걸음",
  BUCKET: "버킷",
  DAILY_TODO: "데일리 투두",
  ROUTINE: "루틴",
  MY_CLOCK: "나의 시간",
  FIND_ME: "숨은 나 찾기",
  // 발걸음 3섹션 라벨 (PR 6 신설, PR 8에서 컴포넌트 분리 시 사용)
  INSIGHT: "인사이트", // 구 "공감 메시지"
  DIRECTION: "지향점", // 구 "방향" — 언젠가 + 1년 안
  EXECUTION_PLAN: "실행계획", // 구 "기간" — 이번 시즌/이번 달/이번 주/오늘
  STRIDE_DETAIL: "한걸음 상세", // 구 "오늘의 한걸음 상세"
} as const;

// 레거시 챕터 RPC 입력용 기본 제목 헬퍼 — 현재 챕터 UI는 제거되었지만 DB RPC는 chapter_title을 요구.
export const DEFAULT_CHAPTER_TITLE_SUFFIX = "이번 시즌 실행";
export function buildDefaultChapterTitle(sceneText: string): string {
  const fallback = sceneText.trim() || "장면";
  return `${fallback} ${DEFAULT_CHAPTER_TITLE_SUFFIX}`;
}

// 버킷 기본 공감 메시지 생성 헬퍼
export function buildDefaultEmpathyMessage(lifeArea: string): string {
  return `${lifeArea}에 대한 장면이네요, 멋져요.`;
}

// 회원탈퇴 확인 문구
export const ACCOUNT_DELETE_CONFIRM_TEXT = "탈퇴합니다";
