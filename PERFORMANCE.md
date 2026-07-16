# 성능 & 상태관리 가이드

slowgoes의 속도/체감 개선은 **서로 다른 관심사를 담당하는 4개 레이어**로 구성된다. "점점 빨라지는 단계"가 아니라 **역할이 다른 도구들**임을 기억할 것.

## 관심사 → 도구 (한눈에)

| 관심사 | 도구 | 위치 |
|--------|------|------|
| 서버 데이터(원격 조회·캐시) | **React Query** | `useQuery` 훅 + 읽기 서버액션 |
| 라우트/셸 캐시(전환 즉시) | **Next.js Router Cache** (`staleTimes`) + `<Link prefetch>` | `next.config.ts` |
| 클라이언트 전역 UI 상태 | **Zustand** *(미도입 — 필요 시)* | `src/stores/*` (예정) |
| URL 상태(공유·북마크) | `useSearchParams` / `router` | 예: 대시보드 `?bucket=` |
| 인증 | middleware `getUser` + `getAuthUser`(getSession) | 데이터 보안은 **RLS** |
| 체감(로딩 깜빡임) | **지연 스켈레톤** `useDelayedFlag` | 임계값 300ms |

**원칙 한 줄**: 서버데이터=React Query · UI상태=Zustand · URL상태=searchParams · 인증=middleware+getAuthUser · 데이터보안=RLS · 로딩표시=지연 스켈레톤.

⚠️ **레이어를 섞지 말 것**: 서버 데이터를 Zustand에 넣거나, 클라 UI 상태를 React Query에 넣지 않는다.

---

## 1. React Query — 서버 상태 (도입 완료)

### 인프라
- `src/lib/react-query/query-client.ts` — 브라우저 싱글톤 `getQueryClient()`. 기본값 **staleTime 60s / gcTime 30분 / refetchOnWindowFocus false**.
- `src/components/providers/query-provider.tsx` — 루트 `app/layout.tsx`에 마운트(네비 전반 캐시 유지).

### 3단 패턴
1. **얇은 서버 페이지** — `getAuthUser()` → 미로그인 `redirect`, 이후 로더만 렌더(데이터 페치 없음).
2. **클라이언트 로더/컴포넌트** — `useXxx()` 훅으로 페치, `isLoading`→지연 스켈레톤, `isError`→배너.
3. **읽기 서버액션(queryFn)** — `"use server"`, `getAuthUser` 가드 + 쿼리.

> 왜 클라 페치인가: App Router는 `<Link>` 재방문마다 서버 컴포넌트를 재실행한다. 데이터를 클라 `useQuery`로 옮겨야 브라우저 싱글톤 캐시가 재방문 시 즉시 뜬다. (서버 프리페치+`HydrationBoundary`는 재방문 즉시성을 깨서 **미사용**.)

### 쿼리 키 컨벤션
- `['diary','list']` · `['diary','entry', id]`
- `['profile','view']`
- `['dashboard', bucketId]` — **버킷별 캐시**
- `['review']`

### 새 캐시 페이지 추가 레시피 (`/foo`)
1. `fetchFooAction()` 읽기 액션 (`getAuthUser` 가드 + 쿼리).
2. `useFoo()` = `useQuery({ queryKey: ['foo'], queryFn: () => fetchFooAction() })`.
3. `FooLoader`(client): `useFoo()` 소비 + 지연 스켈레톤/에러.
4. `foo/page.tsx`(server): `getAuthUser` → redirect → `<FooLoader/>`.

### 뮤테이션 → 무효화 규칙
- 서버 액션은 그대로 두고, **성공 후** `queryClient.invalidateQueries({ queryKey })`.
- 변경이 영향 주는 **모든 키**를 무효화. 예) 대시보드 투두/루틴 토글 → `['dashboard']` **+** `['review']`(회고 통계 영향).
- **`useOptimistic` 사용 시 invalidate를 `await`** 해야 optimistic 값이 깜빡이지 않는다.
- `revalidatePath`는 유지(레이아웃 nav/SSR 최신화). 클라 캐시 정합성은 `invalidateQueries`가 담당.

---

## 2. Next.js 내장 캐싱 — 라우트/셸 캐시

### 설정 (`next.config.ts`)
```ts
experimental: { staleTimes: { dynamic: 30, static: 180 } }
```
- `<Link>` 재방문 시 (얇은) 페이지 RSC를 **dynamic 30초** 재사용 → RSC 왕복·미들웨어 재실행 없이 **전환 즉시**.
- React Query가 데이터 캐시라면, staleTimes는 **셸(라우트) 캐시** — 층이 다르다. 둘을 합치면 재방문이 "데이터도, 전환도" 즉시.

### 부가
- `<Link>` prefetch는 기본값 유지. 끄려면 `prefetch={false}`.
- 값 튜닝: `dynamic`을 키우면 더 오래 즉시(대신 셸이 더 오래 stale). 인증 셸이라 30s 권장.

---

## 3. Zustand — 클라이언트 전역 UI 상태 (미도입 가이드)

> **현재 앱엔 도입돼 있지 않다.** 상태 대부분이 서버(RQ)/URL/로컬이라 즉시 필요가 없다. 아래 조건이 생기면 도입한다.

### 쓸 때 / 쓰지 말 때
- ✅ 쓸 때: **여러 원거리 컴포넌트가 공유하는 순수 클라이언트 UI 상태**. 예) 전역 커맨드팔레트/모달 열림, 사이드바 토글, 다단계 마법사 진행, (서버 반영 전) 필터 UI.
- ❌ 쓰지 말 때:
  - 서버 데이터 → **React Query** (Zustand에 넣으면 이중 소스·동기화 버그).
  - 북마크/공유 가능한 상태(선택 버킷 등) → **searchParams**.
  - 한 컴포넌트 트리 안의 상태(시트 열림 등 colocated) → **useState**.
  - 테마 → 이미 `localStorage` + `data-theme`.

### 도입 방법 (참고, 나중)
```bash
pnpm add zustand   # Provider 불필요(순수 훅)
```
```ts
// src/stores/ui-store.ts (예시)
import { create } from "zustand";
interface UiState { commandOpen: boolean; setCommandOpen: (v: boolean) => void; }
export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
}));
// 사용: const open = useUiStore((s) => s.commandOpen);  // 셀렉터로 구독 최소화
```

---

## 4. 지연 스켈레톤 — 체감 (도입 완료)

### 훅 (`src/hooks/use-delayed-flag.ts`)
`useDelayedFlag(active, delayMs = 300)` — `active`(=isLoading)가 **연속 300ms** 유지될 때만 `true`. 그 전에 끝나면 스켈레톤을 아예 렌더하지 않는다(깜빡임 0).

### 패턴
```tsx
const showSkeleton = useDelayedFlag(isLoading);
if (isLoading || !data) return showSkeleton ? <Skeleton /> : null; // <300ms: 빈 컨텐츠(헤더/nav 유지)
```
- 적용: RQ 클라 로더 전부 — `diary-list-content` · `diary-editor-loader` · `profile-content` · `dashboard-loader` · `review-loader`.
- **라우트 `loading.tsx`는 두지 않는다**: 즉시 뜨는 Suspense fallback이라 "300ms 미만 미표시" 원칙과 충돌. 얇은 페이지라 셸 전환 중엔 이전 화면이 유지되고, 재방문 셸은 staleTimes로 캐시된다. 로딩 UI는 지연 스켈레톤이 단일 관장.
- SSR 주의: 전체 로드 시 첫 페인트에서 최대 300ms 동안 콘텐츠 영역은 비어 있고(헤더/nav는 유지) 이후 스켈레톤/콘텐츠. 의도된 트레이드오프.

---

## 새 기능 추가 체크리스트
1. 데이터가 서버에서 오나? → RQ(읽기액션+훅+로더), 페이지는 얇게.
2. 변경(뮤테이션)? → 서버액션 + `invalidateQueries`(영향 키 전부). optimistic이면 `await`.
3. 공유 UI 상태? → 로컬이면 `useState`, 진짜 전역이면 Zustand(서버데이터 금지).
4. 북마크/공유 상태? → `searchParams`.
5. 로딩 UI? → `useDelayedFlag`(300ms). `loading.tsx` 만들지 말 것.

## 측정 / 디버깅
- 재방문 즉시성: 네트워크 탭에서 재방문 시 서버액션/RSC 재요청이 없는지 확인.
- 지연 임계값: 로더 진입 직후 `[aria-label*="로딩 중"]` 존재 여부를 폴링.
- (선택) React Query Devtools: `@tanstack/react-query-devtools`.
