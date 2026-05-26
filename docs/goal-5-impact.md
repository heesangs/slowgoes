# IA v2 목표 5 — `/actions` 폐기 → 대시보드 흡수 영향 분석

## 목표

- `/actions` 라우트를 폐기하고, 거기 살아 있던 진행중/완료 탭 + 버킷 삭제 메뉴를 `/dashboard`로 흡수.
- 사용자 동선: "대시보드 ↔ 한걸음 상세" 왕복 → **한 화면**에서 같은 작업을 끝낼 수 있게.
- 구 링크 호환을 위해 `/actions` 경로 접근 시 `/dashboard`로 redirect.

## 변경 전후 (요약)

| 측면 | 변경 전 | 변경 후 |
|------|---------|---------|
| 라우트 | `/dashboard` + `/actions` | `/dashboard` 단일 |
| 진행중/완료 탭 | `/actions` 헤더 아래 별도 화면 | `ExecutionPlanSection` 헤더에 흡수 |
| 카드 내부 todos/routines | 항상 모두 표시 | `activeTab`에 따라 진행/완료만 표시 |
| "더보기" 링크 | `ExecutionPlanSection` 우측 상단 → `/actions?bucket=...` | 제거 (같은 화면이므로 이동 불필요) |
| 버킷 삭제 / 더보기 메뉴 | `/actions` 헤더 `MoreActionsMenu` | `ExecutionPlanSection` 헤더 우측 ⋮ 메뉴로 흡수 |
| `revalidatePath("/actions")` | dashboard/actions.ts에 3곳 | 제거 |
| `BUCKET_SCOPED_PATHS` | `["/dashboard", "/actions"]` | `["/dashboard"]` |

## 왜

- `/dashboard`와 `/actions`는 데이터셋도 토글 로직도 거의 동일했다. 같은 화면 두 번.
- 라우트 하나가 사라지면 cookie/URL/searchParams 기반 `selectedBucket` 해석 코드가 한 곳으로 모인다.
- 카드 내부에 진행중/완료 탭이 들어오면, 사용자는 발걸음 컨텍스트(카드 라벨/잔여 기간) 안에서 바로 완료 항목을 확인할 수 있다.

## 영향 파일 (grep 결과 기반)

### 삭제

- `src/app/(main)/actions/page.tsx`
- `src/app/(main)/actions/loading.tsx`
- `src/components/actions/actions-content.tsx`
- `src/components/actions/` 디렉터리 자체

### 수정

- `src/components/dashboard/execution-plan-section.tsx`
  - 헤더에 진행중/완료 탭 추가 (`TabButton` 흡수)
  - "더보기" Link → ⋮ `MoreActionsMenu` (버킷 삭제 액션)
  - 카드 내부 `cardTodos` / `cardRoutines`를 `activeTab` 기준으로 필터링
  - `strideDetailHref`, `extraCount` prop 제거
  - 신규 prop: `onDeleteBucket`, `bucketLabel`, `canDeleteBucket`
- `src/components/dashboard/dashboard-content-v2.tsx`
  - `detailHref` useMemo 블록 제거
  - `deleteBucketAction` import + `handleDeleteBucket` 추가
  - `ExecutionPlanSection` 호출부에서 prop 교체
- `src/components/layout/main-nav-bar.tsx`
  - `BUCKET_SCOPED_PATHS` 에서 `/actions` 제거
- `src/components/navigation/bucket-switcher.tsx`
  - 주석에서 `/actions` 예시 제거 (basePath는 `/dashboard` 하나로 단일화 안내)
- `src/app/(main)/dashboard/actions.ts`
  - `revalidatePath("/actions")` 3곳 제거 (deleteBucketAction / deleteDailyTodoAction / deactivateRoutineAction)
- `src/components/dashboard/execution-plan-section.tsx` 헤더 코멘트 갱신
- `src/types/index.ts` — `extraDailyTodoCount`, `extraRoutineCount` 필드 제거 (더보기 링크 사라짐에 따라)
- `src/app/(main)/dashboard/page.tsx` — 위 필드 채우는 부분 제거

### 신규

- `src/app/(main)/actions/page.tsx` — `redirect("/dashboard")`만 하는 매우 얇은 페이지로 재작성 (loading.tsx는 함께 삭제)

> **대안**: `next.config.ts`의 `redirects()`로 처리하면 server roundtrip 한 번을 더 줄일 수 있다. 다만 현재 코드베이스에 redirects() 규칙 패턴이 없고, 페이지 1줄짜리 redirect가 더 명시적이라 후자를 택한다.

## 카드 내부 탭 흡수 설계

ia-v2.md 명세: "ExecutionPlanSection 내부 탭으로 흡수".

- `activeTab: "active" | "completed"` 상태를 `ExecutionPlanSection` 내부에 둔다.
- 카드별로:
  - `activeTab === "active"`: `status === "pending"` todos + `is_completed_today === false` routines
  - `activeTab === "completed"`: `status === "completed"` todos + `is_completed_today === true` routines
- 카드 헤더 영역은 그대로 (라벨 + 잔여 기간 + 게이지 바 + ⋮).
- 탭 카운트는 *현재 표시 중인 발걸음 그룹 전체*(`dailyTodos` + `routines`)를 기준.

## 버킷 삭제 메뉴 흡수

- `/actions` 헤더의 ⋮ "대시보드로 이동 / 버킷 삭제" → `/dashboard`로 이동 액션은 자기 자신이므로 의미가 없어진다.
- "버킷 삭제"만 남기면 메뉴 액션이 1개. 그래도 ⋮ 진입점 자체는 유지 — 장기적으로 "버킷 이름 변경" 등 추가될 자리.
- 위치: `ExecutionPlanSection` 헤더 우측. 기존 "더보기" Link가 있던 자리에 그대로 꽂는다.
- 사용자 요구 사항의 "BucketSwitcher 칩 long-press 삭제"는 모바일 only & 발견성 낮음 → 이번 PR에선 스킵.

## redirect 처리

```ts
// src/app/(main)/actions/page.tsx — 구 링크 호환만 담당
import { redirect } from "next/navigation";

interface ActionsPageProps {
  searchParams?: Promise<{ bucket?: string }>;
}

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const resolved = (await searchParams) ?? {};
  const bucket = resolved.bucket?.trim();
  redirect(bucket ? `/dashboard?bucket=${bucket}` : "/dashboard");
}
```

## 영향 받지 않는 영역

- `(auth)/actions` 디렉터리 (서버 액션 — 라우트 아님). `signInAction` 등은 그대로.
- `dashboard/actions.ts` 자체는 유지 (서버 액션 파일이지 라우트 아님).
- `profile/actions`, `demo/actions` 등 다른 actions 디렉터리도 무관.

## 검증 체크리스트

- [ ] `/actions` 접근 → `/dashboard`로 redirect (쿼리 보존)
- [ ] `/actions?bucket=<id>` → `/dashboard?bucket=<id>`
- [ ] ExecutionPlanSection 진행중 탭 → 미완료 todos/routines만 노출
- [ ] 완료 탭 → 완료된 todos/routines만 노출 + 카운트 일치
- [ ] 버킷 삭제 메뉴 → 삭제 성공 시 다른 버킷이 있으면 `?bucket=<next>`, 없으면 `/dashboard`
- [ ] 토글 optimistic 회귀 없음
- [ ] `pnpm tsc --noEmit` 통과
- [ ] 모바일 375px 시각 회귀 없음
