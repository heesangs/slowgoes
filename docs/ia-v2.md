# IA v2 — 리팩토링 제안

> 작성 기준 시점: 2026-05-25. 본 문서는 [ia-current.md](./ia-current.md)에서 짚은
> 진입점 분산, 시트 깊이, 라우트 중복 문제를 풀기 위한 *목표 상태*를 정의한다.
> 각 목표는 독립적으로 머지 가능하도록 작게 쪼개되, 마지막 절에 권장 순서를 둔다.

핵심 방향:
- **진입점 1개 원칙** — 같은 의도(추가/전환/탐색)는 한 곳에서만 시작한다.
- **시트 깊이 ≤ 1** — `FAB → Sheet`까지만. 시트 위에 시트는 허용하지 않는다.
- **라우트 ≤ 4** — `/dashboard`, `/profile`, `/review`, `/demo` 외 메인 라우트는 없앤다.
- **용어 단일화** — 사용자 노출 텍스트는 모두 `FEATURE_NAMES` 통과.

---

## 목표 1 — FAB을 "한걸음 더" 단일 진입점으로

### 변경 전후

| 측면 | 현재 | v2 |
|------|------|-----|
| FAB 동작 | `selectedBucket` 유무로 2갈래 분기 | **항상 `StepSheet` 오픈** (목표 4 통합본) |
| `selectedBucket=null` | `FindMeSheet` (mode 미지정 → explore 폴백) | `StepSheet`가 내부에서 "버킷 선택 먼저" 가드 — 없으면 빈 상태 안내 + "새 장면 탐색" 링크 |
| `selectedBucket!=null` | `NextStepSheet(enableAI=false)` | `StepSheet` 한 종류만 — `enableAI` 토글은 시트 내부 옵션 |
| 사용자 멘탈 모델 | "버튼을 누르면 뭐가 뜰지 모름" | "+ 누르면 항상 한걸음 추가" |

### 왜 / 사용자 가치

- 현재 FAB은 동일 아이콘이 두 시트를 띄우기 때문에 "이 버튼이 뭘 하는지"가 컨텍스트마다 다르다.
- "새 장면 탐색"은 추가 흐름이 아니라 **온보딩 연장**이므로 FAB이 아닌 별도 진입점(버킷 칩의 `+`)이 맞다.
- 단일 진입점 원칙: 추가 = 한걸음 더 = StepSheet.

### 영향 범위

- `src/components/dashboard/dashboard-content-v2.tsx`
  - FAB의 `onClick` 분기 제거 → `setStepSheetOpen(true)` 단일 호출
  - `selectedBucket=null` 시 빈 상태 처리 추가 (시트 내부 또는 가드)
- `src/components/dashboard/find-me-sheet.tsx` (이 단계에선 유지, 목표 3에서 폐기)

---

## 목표 2 — 버킷 스위처 칩 공통화 (`BucketSwitcherChips`)

### 변경 전후

| 위치 | 현재 | v2 |
|------|------|-----|
| `InsightSection` (대시보드 상단) | 드롭다운 select | **`<BucketSwitcherChips />`** 가로 스크롤 |
| `FindMeSheet` select 탭 | 카드 리스트 | 삭제 (목표 3) |
| `/actions` 헤더 | 가로 스크롤 chips | **`<BucketSwitcherChips />`** — 동일 컴포넌트 |
| `+` 칩 | `/actions`에만 존재, `FindMeSheet explore` 트리거 | 공통 컴포넌트의 옵션 prop (`onAddBucket`) |
| 라우팅 | `router.replace(?bucket=...)` | 동일 — 공통 훅으로 추출 |

### `BucketSwitcherChips` 설계 (제안)

```tsx
// src/components/dashboard/bucket-switcher-chips.tsx
type Props = {
  buckets: Bucket[];
  selectedBucketId: string | null;
  basePath: "/dashboard" | "/profile" | string; // replace의 베이스
  onAddBucket?: () => void;                     // + 칩 노출 여부 = 이 prop 유무
};
```

- 라우팅은 내부에서 `router.replace(`${basePath}?bucket=${id}`)`.
- 모바일에서 선택된 칩 자동 스크롤(`scrollIntoView({ inline: "center" })`).

### 왜 / 사용자 가치

- 동일 행위(버킷 전환)가 3가지 UI(드롭다운/카드/칩)로 흩어져 있어 어떤 화면에서 어떻게 전환하는지 학습이 필요했다.
- 칩 = 가장 빠른 모바일 전환 패턴이고 가로 스크롤이 정보량 확장에도 유리.
- 공통화하면 `selectedBucket` 동기화 버그(예: 한쪽만 갱신)가 구조적으로 사라진다.

### 영향 범위

- 신규: `src/components/dashboard/bucket-switcher-chips.tsx`
- 신규: `src/hooks/use-switch-bucket.ts` (또는 컴포넌트 내부 inline)
- 수정: `src/components/dashboard/insight-section.tsx` — select → chips 치환
- 수정: `src/components/actions/actions-content.tsx` — 기존 chips 로컬 구현을 공통 컴포넌트로 교체 (목표 5에서 통째로 사라지지만 과도기 호환)
- 수정: `src/components/dashboard/find-me-sheet.tsx` — select 탭은 목표 3에서 제거

---

## 목표 3 — `FindMeSheet` 폐기 → `ExploreNewSceneSheet`

### 변경 전후

| 측면 | 현재 (`FindMeSheet`) | v2 (`ExploreNewSceneSheet`) |
|------|---------------------|-----------------------------|
| 모드 | `select` + `explore` 토글 | **`explore`만** |
| select 책임 | sheet 안의 탭으로 처리 | `BucketSwitcherChips`가 화면 상단에서 처리 (목표 2) |
| 진입점 | InsightSection 드롭다운 / `/actions` `+` 칩 / FAB(`null` 케이스) | `BucketSwitcherChips`의 `onAddBucket` (= `+` 칩) **한 곳** |
| 내부 흐름 | `OnboardingForm` step 2~4 재활용 (변동 없음) | 동일하게 `OnboardingForm` 재활용, `mode="explore"` prop만 전달 |

### 왜 / 사용자 가치

- "숨은 나 찾기"라는 단일 이름 아래 두 개의 행위(전환/탐색)가 묶여 있어 모드 토글이라는 인지 부담이 생겼다.
- 칩이 select를 흡수하면 sheet는 **`explore` 한 가지 책임만** 가지면 되고, 이름도 의도가 명확해진다.
- FAB이 explore로 폴백하던 버그성 동선이 자연스럽게 사라진다 (목표 1과 시너지).

### 영향 범위

- 신규: `src/components/dashboard/explore-new-scene-sheet.tsx`
- 폐기: `src/components/dashboard/find-me-sheet.tsx` — 삭제
- 수정: `src/components/dashboard/dashboard-content-v2.tsx` — `<FindMeSheet>` 참조 제거, `+` 칩 onClick에서 explore sheet 호출
- 수정: `src/components/actions/actions-content.tsx` — 동일 (목표 5에서 통째 폐기 예정이라 과도기 한정)

---

## 목표 4 — `NextStepSheet` + `EditWithAISheet` → `StepSheet` 통합

### 변경 전후

| 측면 | 현재 | v2 |
|------|------|-----|
| 시트 깊이 (루틴 추가) | **3겹** (`mode` → `timeSlot` → `EditWithAISheet`) | **1겹** (`StepSheet` 내부 폼) |
| 시트 깊이 (데일리 투두) | 2겹 (`mode` → `EditWithAISheet`) | 1겹 |
| 발걸음 수정 | `EditWithAISheet` 단독 | `StepSheet`에 `intent="edit"` prop |
| `enableAI` 옵션 | 호출부에서 prop으로 전달 | 시트 내부 토글 + 기본값 자동 결정 |
| 컴포넌트 수 | 2개 + BottomSheet primitives | **1개** + primitives |

### `StepSheet` 설계 (제안)

```tsx
type StepSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bucketId: string;
  intent: "add" | "edit";        // 추가 vs 수정
  target?: {                     // edit일 때 필수
    kind: "todo" | "routine" | "bucket";
    id: string;
    initial: { title: string; ... };
  };
  defaultPeriod?: "today" | "week" | "this_month" | null;
};
```

- 내부 상태로 `kind(todo/routine)`, `timeSlot`(루틴일 때), `text`, `aiEnabled`를 단일 폼에서 관리.
- 루틴 선택 시 timeSlot 입력란이 폼 안에 *확장형*으로 노출 — 새 시트 push 없음.
- `EditWithAISheet`의 todos/routines 삭제 기능은 `intent="edit"` 경로로 흡수.

### 왜 / 사용자 가치

- 시트 위의 시트는 모바일에서 뒤로가기/배경 탭/스와이프 닫기 동작이 모두 헷갈린다 — 3겹은 특히 심함.
- 같은 코드 컴포넌트(`EditWithAISheet`)를 호출 위치마다 다른 의미로 재사용해서 변경 영향이 추적 불가했다.
- 단일 시트로 합치면 "한걸음 더 추가/수정"이라는 행위가 **한 화면 = 한 폼**으로 정렬된다.

### 영향 범위

- 신규: `src/components/dashboard/step-sheet.tsx`
- 폐기: `src/components/dashboard/next-step-sheet.tsx`
- 폐기: `src/components/ui/edit-with-ai-sheet.tsx` — 또는 내부 폼 빌딩블록으로 강등(파일명 유지하되 public API 축소)
- 수정: `src/components/dashboard/dashboard-content-v2.tsx` — 카드 ⋮ "수정/추가" 둘 다 `StepSheet`로 통합
- 마이그레이션 노트: `enableAI` prop을 호출하던 모든 곳은 시트 내부 토글로 대체

---

## 목표 5 — `/actions` 폐기 → 대시보드 흡수

### 변경 전후

| 측면 | 현재 | v2 |
|------|------|-----|
| 라우트 | `/dashboard` + `/actions` 2개 | `/dashboard` 하나 |
| 진행중/완료 탭 | `/actions`에 존재 | 대시보드 `ExecutionPlanSection` 내부 탭으로 흡수 |
| 데이터 페치 | `getDailyTodos`, `getRoutinesWithCompletions`를 **양쪽 페이지에서 중복 호출** | 대시보드 한 곳 |
| Optimistic 토글 로직 | `DashboardContentV2` + `ActionsContent` 중복 | 대시보드 단일 구현 |
| "한걸음 상세" 링크 | `ExecutionPlanSection`의 `detailHref="/actions?bucket=..."` | 제거 — 같은 화면이므로 이동 불필요 |
| 버킷 삭제 / 더보기 메뉴 | `/actions` 헤더 `MoreActionsMenu` | 대시보드 헤더 또는 `BucketSwitcherChips` 칩 long-press / 칩 옆 ⋮ |

### 왜 / 사용자 가치

- `/dashboard`와 `/actions`는 데이터셋도, 토글도 거의 동일했다 — 사실상 **같은 화면 두 번**이었다.
- 라우트가 줄면 cookie/URL/searchParams 기반 `selectedBucket` 해석 코드도 한 곳으로 모인다.
- "상세 보기" 동선이 사라지면 `router.push` 비용도, 뒤로가기 복귀 시 스크롤 복원 이슈도 사라진다.

### 영향 범위

- 삭제: `src/app/(main)/actions/page.tsx`
- 삭제: `src/components/actions/actions-content.tsx` + `more-actions-menu.tsx`
- 삭제: 관련 라우트 핸들러 (`/actions/...` 하위)
- 수정: `src/components/dashboard/execution-plan-section.tsx` — 탭 UI 흡수 + `detailHref` prop 제거
- 수정: `src/components/dashboard/dashboard-content-v2.tsx` — 더보기 메뉴 / 버킷 삭제 액션 흡수
- 수정: `src/lib/dashboard/queries.ts` — `/actions` 전용 가공 함수가 있었다면 통합
- 수정: 리다이렉트 — `/actions?bucket=...` 경로를 `/dashboard?bucket=...`으로 301 또는 클라 리다이렉트 (구 링크 호환)

---

## 목표 6 — 헤더 정리 + 용어 통일

### 변경 전후

| 항목 | 현재 | v2 |
|------|------|-----|
| `MainHeader` 우측 액션 | 회고 / 프로필 / **로그아웃 버튼** | 회고 / 프로필 (로그아웃 제거) |
| 로그아웃 위치 | 헤더 상시 노출 | `/profile` 페이지 하단 또는 설정 영역 |
| 노출 텍스트 | "발걸음", "한걸음", "숨은 나" 등 코드 곳곳 하드코딩 | `FEATURE_NAMES` 상수 100% 사용 |
| 버킷/투두/루틴 표기 | 일부는 영어 코드명 그대로 노출 | 모두 `FEATURE_NAMES.{...}` 경유 |

### 왜 / 사용자 가치

- 헤더 로그아웃은 *의도하지 않은 탭*의 1위 후보 — 모바일 우측 상단은 뒤로가기 / 닫기와 가까워 오탭 빈도가 높다.
- 로그아웃은 본질적으로 계정 컨텍스트이므로 `/profile`이 자연스러운 자리.
- 용어 통일은 마케팅 일관성뿐 아니라 i18n 확장(추후 영어 지원) 시의 단일 진입점.

### 영향 범위

- 수정: `src/components/layout/main-header.tsx` — `SignOutButton` 제거
- 수정: `src/app/(main)/profile/page.tsx` 또는 `src/components/profile/...` — 로그아웃 섹션 추가
- 수정: `src/components/auth/sign-out-button.tsx` — 위치만 옮김, 액션은 그대로
- 전역 검색: `발걸음|한걸음|숨은 나|버킷` 하드코딩 → `FEATURE_NAMES` 치환
  - 주 대상: `dashboard-content-v2.tsx`, `actions-content.tsx`(폐기 전까지), 각 `*Section.tsx`, sheet 컴포넌트

---

## 변경 순서 권장안

작업이 서로의 전제를 깨지 않도록 다음 순서를 권장한다.
각 단계는 **단일 PR**로 분리 가능해야 하며, 머지 후에도 사용자 흐름이 깨지지 않아야 한다.

| 순서 | 목표 | 이유 |
|------|------|------|
| 1 | **목표 6** — 헤더 / 용어 | 다른 목표와 의존성 없음. 가장 안전한 워밍업. |
| 2 | **목표 2** — `BucketSwitcherChips` 공통화 | 목표 3·5의 전제 — 칩이 먼저 select 책임을 흡수해야 sheet/라우트를 지울 수 있다. |
| 3 | **목표 3** — `FindMeSheet` → `ExploreNewSceneSheet` | 칩이 select를 대체한 직후라 sheet를 안전하게 `explore` 단일 책임으로 축소 가능. |
| 4 | **목표 1** — FAB 단일화 | `FindMeSheet explore` 폴백이 사라진 뒤라야 FAB을 `StepSheet` 하나로 모을 수 있다. |
| 5 | **목표 4** — `StepSheet` 통합 | FAB 진입점이 확정된 뒤에 시트 합치기 — 통합 대상이 정해진 상태에서 작업 안전. |
| 6 | **목표 5** — `/actions` 폐기 | 위 5단계가 모두 끝난 뒤라야 라우트 삭제가 회귀 없이 가능. 가장 큰 cleanup. |

### 머지 안전 체크리스트 (각 PR 공통)

- [ ] 데모 흐름(`/demo` → `/demo/complete`)에 영향 없음
- [ ] `selectedBucket` 3단 fallback(URL → cookie → 최신 버킷) 보존
- [ ] Optimistic 토글 회귀 없음 (`useOptimistic` + `router.refresh`)
- [ ] 모바일 375px 기준 시각 회귀 없음
- [ ] `FEATURE_NAMES`로 노출 텍스트 통과

### 비-목표 (이번 v2 범위 외)

- 데이터 모델 변경 (스키마 그대로)
- AI 프롬프트 / Gemini 호출 변경
- 라이프 클락 UI 개편
- `/review` 페이지 — 현재 구조 유지
