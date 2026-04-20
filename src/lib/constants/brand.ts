// 브랜드 및 서비스 내 기능 이름 상수

export const APP = {
  NAME: "slowgoes",
  DEFAULT_USER_NAME: "slowgoes 사용자",
} as const;

export const FEATURE_NAMES = {
  LIFE_SCENE: "삶의 장면",
  LIFE_AREA: "삶의 영역",
  MY_STRIDES: "나의 발걸음",
  TIME_HORIZON: "시간의 지평",
  BUCKET: "버킷",
  CHAPTER: "챕터",
  DAILY_TODO: "데일리 투두",
  ROUTINE: "루틴",
  LIFE_CLOCK: "라이프 클락",
} as const;

// 챕터 기본 제목 생성 헬퍼
export const DEFAULT_CHAPTER_TITLE_SUFFIX = "이번 시즌 실행";
export function buildDefaultChapterTitle(sceneText: string): string {
  return `${sceneText || FEATURE_NAMES.LIFE_SCENE} ${DEFAULT_CHAPTER_TITLE_SUFFIX}`;
}

// 버킷 기본 공감 메시지 생성 헬퍼
export function buildDefaultEmpathyMessage(lifeArea: string): string {
  return `${lifeArea}에 대한 장면이네요, 멋져요.`;
}

// 회원탈퇴 확인 문구
export const ACCOUNT_DELETE_CONFIRM_TEXT = "탈퇴합니다";
