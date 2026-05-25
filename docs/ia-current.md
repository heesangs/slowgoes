# IA 현황 스냅샷 (Current)

> 작성 기준 시점: 2026-05-25. 본 문서는 v2 리팩토링 출발선이 되는 *현재* 정보구조를
> 코드(`src/app/`, `src/components/`) 그대로 정리한 것이다. 변경 제안은 [ia-v2.md](./ia-v2.md) 참고.

---

## 1. 라우트 구조

| 경로 | 그룹 | 페이지 컴포넌트 | 책임 |
|------|------|-----------------|------|
| `/` | (root) | `src/app/page.tsx` | 랜딩 — 로그인 유도 + `/demo` 진입 |
| `/login` | `(auth)` | `src/app/(auth)/login/page.tsx` | Supabase 이메일/소셜 로그인 |
| `/signup` | `(auth)` | `src/app/(auth)/signup/page.tsx` | 회원가입 |
| `/onboarding` | `(auth)` | `src/app/(auth)/onboarding/page.tsx` | Step 1~3 (Profile → Scene → Analysis) |
| `/dashboard` | `(main)` | `src/app/(main)/dashboard/page.tsx` | 메인 — 라이프 클락 + 발걸음 3섹션 |
| `/actions` | `(main)` | `src/app/(main)/actions/page.tsx` | 한걸음 상세 — 진행중/완료 탭 |
| `/profile` | `(main)` | `src/app/(main)/profile/page.tsx` | 프로필 + 통계 |
| `/review` | `(main)` | `src/app/(main)/review/page.tsx` | 회고/리뷰 |
| `/demo`, `/demo/complete` | (root) | `src/app/demo/*` | 체험판 (로그인 불필요) |
| `/auth/callback` | (root) | `src/app/auth/callback/*` | OAuth 콜백 |

### `(main)` 그룹 레이아웃

`src/app/(main)/layout.tsx`는 **server component**로 유지되며, 모든 `(main)` 라우트 상단에
`<MainHeader />`를 강제 마운트한다. 본문은 `max-w-2xl` 단일 컬럼.

---

## 2. 주요 컴포넌트 맵

### 2.1 헤더

```
MainHeader (src/components/layout/main-header.tsx, "use client")
├── <Link href="/dashboard">slowgoes</Link>      ← 로고
├── <Link href="/review" aria-label="회고">      ← 말풍선 아이콘
├── <Link href="/profile" aria-label="프로필">   ← 사람 아이콘
└── <SignOutButton />                            ← 상시 노출 (모든 main 페이지)
    └── signOutAction() — src/app/(auth)/actions.ts
```

### 2.2 대시보드 (`/dashboard`)

```
DashboardContentV2 (src/components/dashboard/dashboard-content-v2.tsx)
├── LifeClockHeader                              ← 나이 그리드
├── InsightSection                               ← 현재 버킷 드롭다운 + 대화 placeholder
│   └── onClickBucket → setFindMeSheetMode("select") → FindMeSheet open
├── DirectionSection                             ← 발걸음 "지향점" (someday + 1년 안)
│   └── 카드 ⋮ → 수정 → EditWithAISheet
├── ExecutionPlanSection                         ← 발걸음 "실행계획" (this_month)
│   ├── 카드 ⋮ → 수정 → EditWithAISheet
│   ├── 카드 ⋮ → 추가 → NextStepSheet (enableAI=true, this_month)
│   ├── 데일리투두 토글 (useOptimistic)
│   ├── 루틴 토글 (useOptimistic)
│   └── "한걸음 상세" Link → /actions?bucket=...   ← detailHref
├── FAB "+" (fixed bottom-right)                 ← 분기형 진입점
│   ├── selectedBucket=null → FindMeSheet (mode 미지정, explore 폴백)
│   └── selectedBucket!=null → NextStepSheet (enableAI=false, defaultPeriod=null)
├── FindMeSheet                                  ← 모드 토글 sheet
├── NextStepSheet                                ← 3단계 stride sheet (mode→timeSlot→edit)
├── EditWithAISheet                              ← 발걸음 수정 + todos/routines 삭제
└── RoutineCalendarSheet                         ← 루틴 달성 캘린더 (modal)
```

### 2.3 한걸음 상세 (`/actions`)

```
ActionsContent (src/components/actions/actions-content.tsx)
├── 헤더 + MoreActionsMenu (⋮)
│   ├── "대시보드로 이동" → router.push(/dashboard?bucket=...)
│   └── "버킷 삭제" → deleteBucketAction
├── 버킷 칩 리스트                                ← 가로 스크롤 chips
│   ├── 일반 칩 × N → router.replace(/actions?bucket=...)
│   └── "+" 칩 → setFindMeSheetOpen(true), defaultMode="explore"
├── 탭 (진행중 / 완료)
├── 데일리투두 섹션 (useOptimistic)
├── 루틴 섹션 (useOptimistic)
│   └── 본문 클릭 → RoutineCalendarSheet
├── FindMeSheet                                   ← defaultMode="explore" 고정
└── RoutineCalendarSheet
```

### 2.4 시트(BottomSheet) / 모달 컴포넌트 인벤토리

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `FindMeSheet` | `src/components/dashboard/find-me-sheet.tsx` | "숨은 나 찾기" — `select` (버킷 전환) / `explore` (새 장면) 모드 토글 |
| `NextStepSheet` | `src/components/dashboard/next-step-sheet.tsx` | "한걸음 더" — mode → (루틴이면) timeSlot → edit 3단계 |
| `EditWithAISheet` | `src/components/ui/edit-with-ai-sheet.tsx` | 텍스트 + AI 생성 + 저장 — 발걸음 수정 / next-step 마지막 단계에서 재사용 |
| `RoutineCalendarSheet` | `src/components/dashboard/routine-calendar-sheet.tsx` | 루틴 주간 캘린더 모달 |
| `BottomSheet` (ui) | `src/components/ui/bottom-sheet.tsx` | 공통 sheet primitive (portal 적용) |

---

## 3. Sheet/Modal 깊이 구조

가장 깊은 스택: **FAB → NextStepSheet(step=mode) → NextStepSheet(step=timeSlot) → EditWithAISheet**.
즉 사용자가 루틴을 추가하려면 **시트가 3겹** 쌓인 셈이다.

```
─ 0층 ─ DashboardContentV2 (page)
        │
        ├── [FAB "+"] ─────────────────┐
        │                              ▼
        │                     ┌───────────────────────────────┐
        │                     │ 1층 ─ NextStepSheet            │
        │                     │   step="mode"                  │
        │                     │   (BottomSheet open)           │
        │                     │   • "데일리 투두" ───────────┐ │
        │                     │   • "루틴" ─────┐            │ │
        │                     └─────────────────│────────────│─┘
        │                                       ▼            ▼
        │                              ┌────────────────────┐ ┌──────────────────────┐
        │                              │ 2층(루틴만)         │ │ 2층 직행(데일리투두)  │
        │                              │ NextStepSheet       │ │ EditWithAISheet      │
        │                              │   step="timeSlot"   │ │   (BottomSheet open) │
        │                              │   (BottomSheet open)│ │                      │
        │                              │   아침/점심/저녁/밤  │ │                      │
        │                              └──────┬─────────────┘ └──────────────────────┘
        │                                     ▼
        │                              ┌────────────────────┐
        │                              │ 3층 ─ EditWithAISheet│
        │                              │   (BottomSheet open) │
        │                              │   텍스트+AI+저장     │
        │                              └────────────────────┘
        │
        ├── [InsightSection 드롭다운] → FindMeSheet (mode="select" 탭 활성)
        │                                  ├── 탭: 내 버킷 (카드 리스트)
        │                                  └── 탭: 새 장면 탐색 (OnboardingForm step 2~4)
        │
        ├── [카드 ⋮ "수정"]   → EditWithAISheet (단일 시트)
        └── [카드 ⋮ "추가"]   → NextStepSheet (위와 동일한 3단계)

─ 0층 ─ ActionsContent (/actions)
        │
        ├── [+ 칩]            → FindMeSheet (defaultMode="explore" 강제)
        └── [⋮ 더보기]        → MoreActionsMenu (popover, 시트 아님)
```

핵심 관찰:
- **NextStepSheet 자체가 내부 step 상태를 가지면서 BottomSheet를 두 번 다른 인스턴스로 마운트**한다 (`stepSheet` + `editSheet`). 코드상 같은 컴포넌트지만 사용자 체감으론 시트 전환이다.
- **FindMeSheet는 1개 시트 안에서 모드 토글로 책임이 2개**(select/explore).
- **EditWithAISheet는 3곳에서 재사용** — 발걸음 수정, next-step 마지막 단계, (PR 37 이후) 시트 하단에서 todos/routines 삭제까지 흡수.

---

## 4. 데이터 흐름

### 4.1 선택된 버킷의 우선순위

`/dashboard`와 `/actions` 두 페이지가 동일한 3단 fallback을 가진다.

```
selectedBucketId =
  1) URL searchParams.bucket  (사용자가 명시적으로 클릭한 칩/카드)
     └─ buckets에 실제로 존재할 때만 채택
  2) cookie.last_viewed_bucket_id  (use-track-last-viewed-bucket.ts가 갱신)
     └─ buckets에 실제로 존재할 때만 채택
  3) buckets[0]?.id  (최신 created_at 가장 위)
```

cookie는 client 훅 `useTrackLastViewedBucket(selectedBucketId)`이 `useEffect`로 `document.cookie`에 기록 (`max-age=30일`, `SameSite=Lax`). 다음 요청 때 서버 컴포넌트가 `cookies()`로 읽음.

### 4.2 라우팅 정책

| 동작 | 메서드 | 이유 |
|------|--------|------|
| 버킷 전환 (대시보드 드롭다운/액션 칩) | `router.replace(?bucket=...)` | 매 전환마다 history 누적 방지 — 뒤로가기 자연스러움 |
| 대시보드 ↔ 한걸음 상세 | `router.push(/...)` | 정상적인 히스토리 진입 |
| 버킷 삭제 후 | `router.replace(/...)` | 삭제된 버킷 URL이 history에 남지 않게 |
| 온보딩 완료 후 토스트 | `router.replace("/dashboard")` | `?onboarding_saved=1` 쿼리 제거 |

### 4.3 Supabase 쿼리 진입점

`src/lib/dashboard/queries.ts`:
- `getProfile`, `getUserBuckets`, `getDailyTodos`, `getRoutinesWithCompletions`, `getStridePlan`

`/dashboard`/`/actions` 페이지는 `Promise.allSettled`로 병렬 페치, 실패는 토스트 메시지로 누적.

### 4.4 Optimistic UI

- `useOptimistic` + `useTransition` 패턴으로 데일리투두/루틴 토글 즉시 반영
- 실패해도 `router.refresh()`로 서버 데이터 재정합
- 동일한 로직이 `DashboardContentV2`와 `ActionsContent` **양쪽에 중복**되어 있음

---

## 5. 한 줄 요약

> 진입점이 흩어져 있다 — 버킷 전환만 해도 **InsightSection 드롭다운, FindMeSheet select 탭, /actions 칩** 3곳에서 가능하고, "추가" 흐름은 **FAB과 카드 ⋮**가 같은 NextStepSheet를 서로 다른 옵션(`enableAI`)으로 띄운다. 시트 깊이 최대 3, /actions 페이지는 대시보드와 페치 로직이 거의 중복.
