# slowgoes 통합 실행 로드맵 진행 문서

- 마지막 갱신: 2026-03-10
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
| Phase 2 — 대시보드 v2 | S2 | 부분 완료 | 2/7 | 기능 구현 완료, 구조 분리 미완료 |
| Phase 3 — 버킷/챕터 관리 | S3 | 미착수 | 0/4 (0%) | 라우트/CRUD/연결 미구현 |
| Phase 4 — AI 고도화 | S4 | 미착수 | 0/4 (0%) | 매트릭스/학습/리뷰 미구현 |
| Phase 5 — 톤/디자인 마감 | S5 | 부분 완료 | 2.5/3 | 카피/모바일 개선 일부 반영, 최종 QA 미완 |

---

## 2) 티켓 상세 현황

### Phase 0 (S0) — 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-001 Phase0 마이그레이션(SQL) | 완료 | `supabase/migrations/20260308193000_phase0_expand_life_schema.sql` |
| SG-002 Phase0 RLS/인덱스 | 완료 | `supabase/migrations/20260308194500_phase0_life_schema_rls_indexes.sql` |
| SG-003 도메인 타입 추가 | 완료 | `src/types/index.ts` |
| SG-004 대시보드 데이터 헬퍼 | 완료 | `src/lib/dashboard/queries.ts` |
| SG-005 feature flag 추가 | 부분 완료 | `src/lib/flags.ts` 구현 완료. `dashboard_v2` 사용 중, `onboarding_v2` 분기 연결은 후속 필요 |

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

### Phase 2 (S2) — 기능 구현, 구조 미분리

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-201 대시보드 서버 집계 연결 | 완료 | `src/app/(main)/dashboard/page.tsx` |
| SG-202 LifeClockHeader | 미완료(인라인 구현) | `dashboard-content-v2.tsx` 내부 구현, 파일 분리 없음 |
| SG-203 DailyStepCard | 미완료(인라인 구현) | `dashboard-content-v2.tsx` 내부 구현, 파일 분리 없음 |
| SG-204 LifeBalanceCard | 미완료(인라인 구현) | `dashboard-content-v2.tsx` 내부 구현, 파일 분리 없음 |
| SG-205 BucketSuggestionCard | 미완료(인라인 구현) | `dashboard-content-v2.tsx` 내부 구현, 파일 분리 없음 |
| SG-206 ReviewInsightCard | 미완료(인라인 구현) | `dashboard-content-v2.tsx` 내부 구현, 파일 분리 없음 |
| SG-207 AllTasksView 분리 | 미완료 | `all-tasks-view.tsx` 없음 |

### Phase 3 (S3) — 미착수

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-301 /buckets 목록+CRUD | 미착수 | `src/app/(main)/buckets/page.tsx` 없음 |
| SG-302 /buckets/[id] 상세+챕터 | 미착수 | `src/app/(main)/buckets/[id]/page.tsx` 없음 |
| SG-303 /tasks/new 버킷/챕터 연결 | 미착수 | `task-input-form.tsx` 및 `saveTaskAction`에 연결 파라미터 없음 |
| SG-304 decomposeBucketAction | 미착수 | `src/lib/ai/analyze.ts`에 버킷 분해 액션 없음 |

### Phase 4 (S4) — 미착수

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-401 성향×페이스 프롬프트 매트릭스 | 미착수 | task 분석 프롬프트에 매트릭스 로직 없음 |
| SG-402 컨디션 추천 반영 | 미착수 | dashboard/task 추천 분기에 컨디션 로직 없음 |
| SG-403 난이도 학습 테이블+로직 | 미착수 | 관련 마이그레이션/로직 없음 |
| SG-404 /review 구현 + 인사이트 | 미착수 | `src/app/(main)/review/page.tsx` 없음 |

### Phase 5 (S5) — 부분 완료

| 티켓 | 상태 | 근거 |
|---|---|---|
| SG-501 카피/톤 정리 | 부분 완료 | 온보딩/대시보드 문구 개선 반영, 최종 통일 점검 필요 |
| SG-502 QA/접근성/모바일 | 부분 완료 | 모바일 대응 일부 반영, WCAG 기준 전체 점검 미완 |
| SG-503 점진 배포 | 부분 완료 | flag 인프라 완료, 실제 단계 공개/운영 절차 미완 |

---

## 3) 다음 단계 실행 계획 (우선순위)

### A. Phase 2 마무리 (S2)

1. SG-207: `AllTasksView` 분리
2. SG-203: `DailyStepCard` 분리
3. SG-202: `LifeClockHeader` 분리
4. SG-204: `LifeBalanceCard` 분리
5. SG-205: `BucketSuggestionCard` 분리
6. SG-206: `ReviewInsightCard` 분리
7. SG-005 보완: `onboarding_v2` 실제 분기 연결

완료 기준:
- `dashboard-content-v2.tsx`는 오케스트레이션만 담당
- 섹션 UI는 개별 컴포넌트 파일로 분리
- `pnpm lint`, `pnpm build` 통과

### B. Phase 3 착수 (S3)

1. SG-301: `/buckets` 라우트 + CRUD
2. SG-302: `/buckets/[id]` + chapter CRUD
3. SG-303: `/tasks/new` bucket/chapter 선택 연결
4. SG-304: bucket 분해 AI 액션 추가

완료 기준:
- 버킷/챕터 생성-수정-삭제 흐름 동작
- task 생성 시 선택적 연결 저장 동작
- 권한/소유권(RLS) 회귀 없음

### C. Phase 4~5 진행

1. SG-401~404: AI 고도화 + `/review` 구현
2. SG-501~503: 톤 마감, QA, 점진 배포

---

## 4) 즉시 착수 체크리스트 (이번 주)

- [ ] SG-207 `all-tasks-view.tsx` 파일 생성 및 분리
- [ ] SG-203 `daily-step-card.tsx` 파일 생성 및 분리
- [ ] SG-202 `life-clock-header.tsx` 파일 생성 및 분리
- [ ] SG-204 `life-balance-card.tsx` 파일 생성 및 분리
- [ ] SG-205 `bucket-suggestion-card.tsx` 파일 생성 및 분리
- [ ] SG-206 `review-insight-card.tsx` 파일 생성 및 분리
- [ ] SG-005 `onboarding_v2` 플래그 분기 연결
- [ ] lint/build 점검 후 상태 업데이트

---

## 5) 작업 로그 (진행하면서 계속 추가)

| 날짜 | 티켓 | 작업 내용 | 결과 | 다음 액션 |
|---|---|---|---|---|
| 2026-03-10 | 문서화 | 통합 실행 로드맵 현황/계획 문서 생성 | 완료 | SG-207부터 구현 시작 |

---

## 6) 문서 운영 규칙

1. 티켓 시작 시 상태를 `진행중`으로 바꾼다.
2. 구현 + 검증(lint/build/핵심 플로우 확인) 후에만 `완료`로 바꾼다.
3. 모든 PR/커밋 후 작업 로그에 1줄 추가한다.
4. 우선순위 변경 시 3) 실행 계획 섹션을 먼저 수정한다.
