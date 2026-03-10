# slowgoes 통합 실행 로드맵 진행 문서

- 마지막 갱신: 2026-03-11
- 기준 문서:
  - `/Users/heesangs/Desktop/slowgoes/slowgoes_개편계획_v2.md`
  - `/Users/heesangs/Desktop/slowgoes/slowgoes_온보딩_대시보드_UI기획_v2.md`
  - `/Users/heesangs/Downloads/Programing/slowgoes/DEVELOPER.md`
- 저장소: `/Users/heesangs/Downloads/Programing/slowgoes`
- 목적: 현재 상태를 단일 문서로 관리하고, 다음 실행 순서를 고정한다.

---

## 1) 통합 실행 로드맵 진행 상황 요약

| Phase | Sprint | 상태 | 진행률 | 메모 |
|---|---|---|---|---|
| Phase 0 — DB/타입/쿼리 기반 | S0 | 완료 | 5/5 (100%) | 마이그레이션/RLS/RPC 반영 완료 |
| Phase 1 — 온보딩 v2 | S1 | 완료 | 8/8 (100%) | Step1~4 + AI + 저장 + 리다이렉트 완료 |
| Phase 2 — 대시보드 v2 | S2 | 완료 | 7/7 (100%) | 5섹션 + AllTasksView 구조 분리 완료 |
| Phase 3 — 버킷/챕터 관리 | S3 | 완료 | 4/4 (100%) | 버킷/챕터 CRUD + task 연결 + bucket AI 분해 완료 |
| Phase 4 — AI 고도화 | S4 | 완료 | 4/4 (100%) | 매트릭스/컨디션/학습/리뷰 구현 완료 |
| Phase 5 — 톤/디자인 마감 | S5 | 완료 | 3/3 (100%) | 카피/접근성/점진 배포 반영 + lint/build/스모크 검증 완료 |

---

## 2) 티켓 상세 현황

### Phase 0 (S0) — 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-001 Phase0 마이그레이션(SQL) | 완료 | `supabase/migrations/20260308193000_phase0_expand_life_schema.sql` |
| SG-002 Phase0 RLS/인덱스 | 완료 | `supabase/migrations/20260308194500_phase0_life_schema_rls_indexes.sql` |
| SG-003 도메인 타입 추가 | 완료 | `src/types/index.ts` |
| SG-004 대시보드 데이터 헬퍼 | 완료 | `src/lib/dashboard/queries.ts` |
| SG-005 feature flag 추가 | 완료 | `src/lib/flags.ts`, `src/app/(auth)/actions.ts`, `src/app/(auth)/onboarding/page.tsx`, `src/app/(main)/dashboard/page.tsx` |

### Phase 1 (S1) — 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-101 온보딩 Step1 UI | 완료 | `src/components/auth/onboarding-form.tsx` |
| SG-102 온보딩 Step2 데모리스트 | 완료 | `src/lib/onboarding/demo-scenes.ts` |
| SG-103 analyzeLifeSceneAction | 완료 | `src/app/(main)/tasks/actions.ts`, `src/lib/ai/analyze.ts` |
| SG-104 온보딩 Step3 UI 통합 | 완료 | `src/components/auth/onboarding-form.tsx` |
| SG-105 generateFirstStepAction | 완료 | `src/app/(main)/tasks/actions.ts`, `src/lib/ai/analyze.ts` |
| SG-106 페이스 칩 조정 로직 | 완료 | `src/components/auth/onboarding-form.tsx` |
| SG-107 save_onboarding_data RPC | 완료 | `supabase/migrations/20260308200000_create_save_onboarding_data_rpc.sql` |
| SG-108 /onboarding 통합 연결 | 완료 | `src/app/(auth)/actions.ts`, `src/app/(auth)/onboarding/page.tsx` |

### Phase 2 (S2) — 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-201 대시보드 서버 집계 연결 | 완료 | `src/app/(main)/dashboard/page.tsx` |
| SG-202 LifeClockHeader | 완료 | `src/components/dashboard/life-clock-header.tsx`, `dashboard-content-v2.tsx` |
| SG-203 DailyStepCard | 완료 | `src/components/dashboard/daily-step-card.tsx`, `dashboard-content-v2.tsx` |
| SG-204 LifeBalanceCard | 완료 | `src/components/dashboard/life-balance-card.tsx`, `dashboard-content-v2.tsx` |
| SG-205 BucketSuggestionCard | 완료 | `src/components/dashboard/bucket-suggestion-card.tsx`, `dashboard-content-v2.tsx` |
| SG-206 ReviewInsightCard | 완료 | `src/components/dashboard/review-insight-card.tsx`, `dashboard-content-v2.tsx` |
| SG-207 AllTasksView 분리 | 완료 | `src/components/dashboard/all-tasks-view.tsx`, `dashboard-content-v2.tsx`, `dashboard-content.tsx` |

### Phase 3 (S3) — 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-301 /buckets 목록+CRUD | 완료 | `src/app/(main)/buckets/page.tsx`, `src/components/buckets/buckets-page-content.tsx`, `src/app/(main)/buckets/actions.ts` |
| SG-302 /buckets/[id] 상세+챕터 | 완료 | `src/app/(main)/buckets/[id]/page.tsx`, `src/components/buckets/bucket-detail-content.tsx`, `src/app/(main)/buckets/actions.ts` |
| SG-303 /tasks/new 버킷/챕터 연결 | 완료 | `src/app/(main)/tasks/new/page.tsx`, `src/components/task/task-input-form.tsx`, `src/components/task/task-creator.tsx`, `src/app/(main)/tasks/actions.ts` |
| SG-304 decomposeBucketAction | 완료 | `src/lib/ai/analyze.ts`, `src/app/(main)/buckets/actions.ts`, `src/components/buckets/bucket-detail-content.tsx` |

### Phase 4 (S4) — 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-401 성향×페이스 프롬프트 매트릭스 | 완료 | `src/lib/ai/analyze.ts` (`analyzeTask`, `decomposeSubtask`, `decomposeBucket`) |
| SG-402 컨디션 추천 반영 | 완료 | `src/lib/dashboard/queries.ts`, `src/app/(main)/dashboard/page.tsx`, `src/components/dashboard/daily-step-card.tsx`, `dashboard-content-v2.tsx` |
| SG-403 난이도 학습 테이블+로직 | 완료 | `supabase/migrations/20260311190000_add_difficulty_adjustments.sql`, `src/app/(main)/tasks/actions.ts`, `src/lib/ai/analyze.ts` |
| SG-404 /review 구현 + 인사이트 | 완료 | `src/app/(main)/review/page.tsx`, `src/components/review/review-page-content.tsx`, `src/lib/stats.ts`, `src/components/dashboard/review-insight-card.tsx` |

### Phase 5 (S5) — 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-501 카피/톤 정리 | 완료 | `src/components/auth/onboarding-form.tsx`, `src/components/dashboard/*`, `src/components/review/review-page-content.tsx` 문구 톤 정리 |
| SG-502 QA/접근성/모바일 | 완료 | 44px 터치 타겟 상향(`button.tsx`, `task-input-form.tsx`, `subtask-card.tsx`, `subtask-check-item.tsx` 등) + `/review/loading.tsx` + 스모크(`/dashboard`, `/review`, `/tasks/new`) |
| SG-503 점진 배포 | 완료 | `src/lib/flags.ts` 사용자 단위 롤아웃(퍼센트) + `auth/dashboard/onboarding` 분기 연동 |

---

## 3) 다음 단계 실행 계획 (우선순위)

### A. Phase 2 후속 정리

1. 없음 (S2 구조 분리 + SG-005 분기 연결 완료)

완료 기준:
- `dashboard-content-v2.tsx`는 오케스트레이션만 담당
- 섹션 UI는 개별 컴포넌트 파일로 분리
- `pnpm lint`, `pnpm build` 통과

### B. Phase 3 착수 (S3)

1. 없음 (S3 완료)

완료 기준:
- 버킷/챕터 생성-수정-삭제 흐름 동작
- task 생성 시 선택적 연결 저장 동작
- 권한/소유권(RLS) 회귀 없음

### C. Phase 4~5 진행

1. 없음 (Phase 5 완료, 운영 rollout 퍼센트 조정만 남음)

---

## 4) 즉시 착수 체크리스트 (이번 주)

- [x] SG-401 성향×페이스 프롬프트 매트릭스 반영
- [x] SG-402 컨디션 기반 추천 분기 반영
- [x] SG-403 난이도 학습 테이블 + 반영 로직
- [x] SG-404 `/review` 페이지 + 인사이트 연결
- [x] SG-501 카피/톤 정리
- [x] SG-502 실기기/접근성 최종 점검
- [x] SG-503 사용자 단위 점진 배포 분기
- [x] lint/build 점검 후 상태 업데이트

---

## 5) 작업 로그 (진행하면서 계속 추가)

| 날짜 | 티켓 | 작업 내용 | 결과 | 다음 액션 |
|---|---|---|---|---|
| 2026-03-10 | 문서화 | 통합 실행 로드맵 현황/계획 문서 생성 | 완료 | SG-207부터 구현 시작 |
| 2026-03-11 | SG-207 | `AllTasksView` 신규 생성 및 v1/v2 대시보드 연결 | 완료 | SG-203 카드 분리 시작 |
| 2026-03-11 | SG-203 | `DailyStepCard` 컴포넌트 분리 및 v2 대시보드 연결 | 완료 | SG-202 카드 분리 시작 |
| 2026-03-11 | SG-202 | `LifeClockHeader` 컴포넌트 분리 및 v2 대시보드 연결 | 완료 | SG-204 카드 분리 시작 |
| 2026-03-11 | SG-204 | `LifeBalanceCard` 컴포넌트 분리 및 v2 대시보드 연결 | 완료 | SG-205 카드 분리 시작 |
| 2026-03-11 | SG-205 | `BucketSuggestionCard` 컴포넌트 분리 및 v2 대시보드 연결 | 완료 | SG-206 카드 분리 시작 |
| 2026-03-11 | SG-206 | `ReviewInsightCard` 컴포넌트 분리 및 v2 대시보드 연결 | 완료 | SG-005 분기 연결 후 S3 착수 |
| 2026-03-11 | SG-005 | `onboarding_v2` 분기 연결 (signIn/signUp, onboarding page, dashboard fallback) | 완료 | S3(SG-301) 착수 |
| 2026-03-11 | SG-301 | `/buckets` 라우트 + CRUD + 시간지평 필터/그룹 UI 구현, `pnpm lint`/`pnpm build` 통과 확인 | 완료 | SG-302 상세+챕터 진행 |
| 2026-03-11 | SG-302 | `/buckets/[id]` 상세 + chapter CRUD + `/tasks/new` 진입 버튼 구현, `pnpm lint`/`pnpm build` 통과 확인 | 완료 | SG-303 task 연결 저장 진행 |
| 2026-03-11 | SG-303 | `/tasks/new`에 bucket/chapter 선택 UI + 기본값(query) + `saveTaskAction` 연결 저장/정합성 검증 구현, `pnpm lint`/`pnpm build` 통과 확인 | 완료 | SG-304 bucket 분해 AI 진행 |
| 2026-03-11 | SG-304 | 버킷 분해 AI(`decomposeBucket`) + 성향×페이스 반영 + `/buckets/[id]` AI 제안 UI/챕터 추가 연결 구현, `pnpm lint`/`pnpm build` 통과 확인 | 완료 | Phase 4(SG-401) 착수 |
| 2026-03-11 | SG-401 | `analyzeTask`, `decomposeSubtask`, `decomposeBucket` 프롬프트에 성향×페이스 매트릭스 규칙 주입, `pnpm lint`/`pnpm build` 통과 확인 | 완료 | SG-402 컨디션 추천 반영 진행 |
| 2026-03-11 | SG-402 | 대시보드 컨디션 선택(가볍게/보통/집중/지침) + 조건별 오늘의 한 걸음 추천 분기 구현, `pnpm lint`/`pnpm build` 통과 확인 | 완료 | SG-403 난이도 학습 진행 |
| 2026-03-11 | SG-403 | `difficulty_adjustments` 테이블 + RLS/인덱스 추가, `saveTaskAction` 조정 이력 적재, `analyzeTask`/`decomposeSubtask` 학습 힌트 반영, `pnpm lint`/`pnpm build` 통과 확인 | 완료 | SG-404 `/review` 구현 진행 |
| 2026-03-11 | SG-404 | `/review` 페이지 구현, `stats` 기반 회고 집계/인사이트 공급, 대시보드 회고 카드 상세 이동 연결 구현 | 완료 | Phase 5(SG-501~503) 진행 |
| 2026-03-11 | SG-501~503 | 카피 톤 정리, 44px 터치 타겟/`/review` 로딩 상태 반영, 사용자 단위 flag 롤아웃(퍼센트) 및 auth/dashboard/onboarding 분기 연결, 스모크(`/dashboard`, `/review`, `/tasks/new`) + lint/build 검증 | 완료 | 운영 환경 rollout 퍼센트 단계 적용 |
| 2026-03-11 | 운영 후속(플래그 기본값) | 개편 후 기존 계정에서 v1 화면 노출 이슈 재현/점검, `src/lib/flags.ts` 기본값을 v2 기준(true)으로 전환 | 완료 | 운영 환경에서 `FF_*`/`NEXT_PUBLIC_FF_*` 값 충돌 여부 점검 |

---

## 6) 운영 체크포인트

1. 기본 동작은 v2(`onboarding_v2=true`, `dashboard_v2=true`)로 동작한다.
2. 롤백이 필요하면 환경변수 `FF_ONBOARDING_V2=false`, `FF_DASHBOARD_V2=false`로 즉시 차단한다.
3. 점진 공개가 필요하면 `FF_*_ROLLOUT`를 사용하고, bool 플래그(`FF_*`)가 우선순위가 더 높다.
4. 런타임 분기 확인 순서: 환경변수 로드 여부 -> 유저 단위 rollout 해시 -> 기본값.

---

## 7) 문서 운영 규칙

1. 티켓 시작 시 상태를 `진행중`으로 바꾼다.
2. 구현 + 검증(lint/build/핵심 플로우 확인) 후에만 `완료`로 바꾼다.
3. 모든 PR/커밋 후 작업 로그에 1줄 추가한다.
4. 우선순위 변경 시 3) 실행 계획 섹션을 먼저 수정한다.
