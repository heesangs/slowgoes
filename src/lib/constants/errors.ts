// 서비스 전반에 걸쳐 사용되는 에러 메시지 상수

export const AUTH_ERRORS = {
  SIGN_IN_GENERIC: "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  SIGN_IN_FAILED: "로그인에 실패했습니다.",
  SIGN_IN_TOO_MANY_REQUESTS: "요청이 많아 잠시 제한되었어요. 잠시 후 다시 시도해주세요.",
  SIGN_IN_EMAIL_NOT_CONFIRMED:
    "이메일 인증이 완료되지 않았어요. 메일함에서 인증 후 다시 로그인해주세요.",
  SIGN_IN_NETWORK_ERROR:
    "네트워크 연결이 불안정해 로그인에 실패했습니다. 연결 상태를 확인해주세요.",
  SIGN_IN_INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  SIGN_IN_UNAUTHORIZED: "로그인 권한을 확인할 수 없습니다. 다시 로그인해주세요.",
  SIGN_IN_SERVER_ERROR: "서버 오류로 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
  EMAIL_PASSWORD_REQUIRED: "이메일과 비밀번호를 입력해주세요.",
  EMAIL_DOMAIN_INVALID: "이메일 도메인이 유효하지 않아요. 주소를 다시 확인해주세요.",
  PROFILE_LOAD_ERROR: "프로필 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  AUTH_REQUIRED: "인증이 필요합니다.",
  LOGIN_REQUIRED: "로그인이 필요합니다.",
} as const;

export const PROFILE_ERRORS = {
  DISPLAY_NAME_INVALID: "닉네임을 올바르게 입력해주세요.",
  SAVE_FAILED: "프로필 저장에 실패했습니다. 다시 시도해주세요.",
} as const;

export const PASSWORD_ERRORS = {
  REQUIRED: "비밀번호를 입력해주세요.",
  TOO_SHORT: "비밀번호는 최소 6자 이상이어야 합니다.",
  MISMATCH: "비밀번호가 일치하지 않습니다.",
  INCORRECT: "비밀번호가 올바르지 않습니다.",
  CHANGE_FAILED: "비밀번호 변경에 실패했습니다. 다시 시도해주세요.",
} as const;

export const ACCOUNT_ERRORS = {
  DELETE_GENERIC: "회원탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  DELETE_SERVER_ERROR: "서버 오류로 회원탈퇴에 실패했습니다. 잠시 후 다시 시도해주세요.",
} as const;

export const VALIDATION_ERRORS = {
  SCENE_TEXT_REQUIRED: "삶의 장면을 입력해주세요.",
  SCENE_TEXT_EMPTY: "삶의 장면이 비어 있습니다.",
  LIFE_AREA_EMPTY: "삶의 영역 정보가 비어 있습니다.",
  AGE_INVALID: "나이 값이 올바르지 않습니다.",
  GENDER_INVALID: "성별 값이 올바르지 않습니다.",
  PERSONALITY_INVALID: "성향 값이 올바르지 않습니다.",
  PACE_TYPE_INVALID: "페이스 값이 올바르지 않습니다.",
  PACE_OPTION_INVALID: "페이스 옵션 값이 올바르지 않습니다.",
  DAILY_TODO_OR_ROUTINE_REQUIRED: "데일리투두 또는 루틴을 최소 1개 선택해주세요.",
  WEEKLY_ACTION_REQUIRED: "이번 주 행동을 선택해주세요.",
  ONBOARDING_V2_DISABLED: "온보딩 v2가 비활성화되어 있습니다.",
  ONBOARDING_SAVE_FAILED: "온보딩 저장에 실패했습니다. 다시 시도해주세요.",
  CURRENT_PLAN_INVALID: "현재 실행안 정보가 올바르지 않습니다.",
} as const;

export const AI_ERRORS = {
  SERVICE_ERROR: "AI 서비스 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  SCENE_ANALYSIS_ERROR: "삶의 장면 분석 중 오류가 발생했습니다.",
  FIRST_STEP_ERROR: "첫 실행안 생성 중 오류가 발생했습니다.",
  PACE_ADJUST_ERROR: "페이스 조정 중 오류가 발생했습니다.",
  RESPONSE_INVALID: "AI 응답이 올바르지 않습니다.",
  ANALYSIS_GENERIC: "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  RATE_LIMIT_WITH_RETRY: (retrySeconds: number) =>
    `AI 사용량 한도에 도달했어요. ${retrySeconds}초 후 다시 시도하거나 Gemini 요금제/한도를 확인해주세요.`,
  RATE_LIMIT: "AI 사용량 한도에 도달했어요. 잠시 후 다시 시도하거나 Gemini 요금제/한도를 확인해주세요.",
  API_KEY_INVALID: "Gemini API 키 또는 권한 설정을 확인해주세요.",
  ACTION_TIP_FAILED: "행동 조언 생성에 실패했습니다.",
} as const;

export const BUCKET_ERRORS = {
  ACCESS_DENIED: "해당 버킷에 접근할 수 없습니다.",
  NOT_FOUND_OR_ACCESS_DENIED: "버킷을 찾을 수 없거나 접근 권한이 없습니다.",
  LIFE_AREA_ACCESS_DENIED: "선택한 삶의 영역에 접근할 수 없습니다.",
  TITLE_REQUIRED: "버킷 제목을 입력해주세요.",
  STRIDE_SCOPE_INVALID: "나의 발걸음 값이 올바르지 않습니다.",
  STATUS_INVALID: "상태 값이 올바르지 않습니다.",
  CREATE_FAILED: "버킷 생성에 실패했습니다.",
  CREATE_ERROR: "버킷 생성 중 오류가 발생했습니다.",
  UPDATE_FAILED: "버킷 수정에 실패했습니다.",
  UPDATE_ERROR: "버킷 수정 중 오류가 발생했습니다.",
  DELETE_ERROR: "버킷 삭제 중 오류가 발생했습니다.",
  LIST_ERROR: "버킷 목록을 불러오지 못했습니다.",
  INFO_NOT_FOUND: "버킷 정보를 찾을 수 없습니다.",
  STRIDE_PLAN_REQUIRED: "AI 추천 정보를 먼저 생성해주세요.",
  TITLE_EMPTY: "버킷 제목이 비어 있습니다.",
} as const;

export const TODO_ERRORS = {
  ACCESS_DENIED: "해당 데일리투두에 접근할 수 없습니다.",
  ADD_FAILED: "데일리투두 추가에 실패했습니다.",
  STATUS_CHANGE_FAILED: "데일리투두 상태 변경에 실패했습니다.",
  NOT_FOUND: "데일리투두 정보를 찾을 수 없습니다.",
  TITLE_REQUIRED: "데일리투두 제목을 입력해주세요.",
  WEEKLY_GENERATE_FAILED: "이번 주 항목 생성에 실패했습니다.",
} as const;

export const ROUTINE_ERRORS = {
  ACCESS_DENIED: "해당 루틴에 접근할 수 없습니다.",
  ADD_FAILED: "루틴 추가에 실패했습니다.",
  COMPLETE_FAILED: "루틴 완료 처리에 실패했습니다.",
  NOT_FOUND: "루틴 정보를 찾을 수 없습니다.",
  TITLE_REQUIRED: "루틴 제목을 입력해주세요.",
} as const;

export const STRIDE_ERRORS = {
  DATA_FORMAT_INVALID: "발걸음 데이터 형식이 올바르지 않습니다.",
  LEVEL_INVALID: "발걸음 레벨이 올바르지 않습니다.",
  LEVEL_INVALID_ALT: "유효하지 않은 발걸음 레벨입니다.",
  LEVEL_NOT_IN_PLAN: "해당 레벨이 현재 발걸음 구성에 없습니다.",
  EMPTY_ACTION: "빈 action은 저장할 수 없습니다.",
  COUNT_INVALID: "발걸음은 3~6개여야 합니다.",
  SOMEDAY_REQUIRED: "'언젠가' 발걸음은 반드시 포함되어야 합니다.",
  REGENERATE_ALL_FAILED: "발걸음 전체 재생성에 실패했습니다.",
  REGENERATE_SINGLE_FAILED: "발걸음 재생성에 실패했습니다.",
  REGENERATE_RESULT_EMPTY: "발걸음 재생성 결과가 비어 있습니다.",
  PROFILE_NOT_FOUND: "프로필 정보가 없습니다.",
  LIFE_AREA_EMPTY: "삶의 영역이 비어 있습니다.",
  ITEM_TITLE_EMPTY: "항목 제목이 비어 있습니다.",
  EXISTING_BUCKET_ADD_ERROR: "기존 버킷에 아이템 추가 중 오류가 발생했습니다.",
} as const;
