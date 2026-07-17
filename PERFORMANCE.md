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

### ⚠️ 뮤테이션 3대 함정 (실제로 겪은 것 — 일기 저장이 왕복 9회였던 원인)

**1. 변경이 없으면 서버를 부르지 마라 (dirty 체크)**
저장 버튼이 무조건 액션을 호출하면, 사용자가 아무것도 안 고쳐도 write+무효화+재페치 체인이 전부 돈다.
기준선(baseline)과 비교해 변경이 없으면 **호출 자체를 하지 않는다**. 일기 에디터는 아예 **완료 버튼을 숨긴다**(`isDirty && <Button/>`).
> 타이핑마다 리렌더되지 않도록 `setIsDirty(prev => prev === next ? prev : next)` — 같은 값이면 같은 참조를 반환해 React가 bail out.

**2. `invalidateQueries`를 접두사로 넓게 쓰지 마라**
`invalidateQueries({ queryKey: ['diary'] })`는 `['diary','entry',id]`까지 매칭한다. 그 쿼리가 **active**(지금 화면)면 **즉시 재페치** — 곧 떠날 화면인데 왕복만 낭비.
→ **결과를 이미 아는 변경은 `setQueryData`로 직접 갱신**(재페치 0). 삭제는 `removeQueries`로 폐기.
```ts
// 저장: 목록/상세 캐시를 직접 갱신 → 목록 진입 시 이미 최신
queryClient.setQueryData<DiaryListItem[]>(['diary','list'], (old) =>
  old?.map((i) => (i.id === id ? { ...i, title: deriveDiaryTitle(text), preview: derivePreview(text) } : i))
);
// 삭제: 목록에서 제거 + 상세 캐시 폐기(재페치 방지)
queryClient.removeQueries({ queryKey: ['diary','entry', id] });
```

**3-1. 저장은 기다리게 하지 마라 — 낙관적 저장 + 로컬 드래프트 (일기 저장의 현재 방식)**
사용자를 서버 쓰기(~0.5~1s) 앞에 세워두지 않는다. **로컬에 먼저 확정 기록** → 캐시 갱신 → **즉시 이동** → 백그라운드 flush.
```
완료 클릭
 ① saveDiaryDraft(localStorage)   ← 여기서 이미 유실 불가
 ② setQueryData(목록/상세)          ← 화면은 이미 최신
 ③ toast + router.push('/diary')   ← 체감 저장 0ms
 ④ void saveDiaryAction(...)       ← 백그라운드
     성공 → clearDiaryDraft(id)
     실패 → 드래프트 유지 + "동기화 지연" 안내 → 목록 재진입 시 자동 재전송
```
- **멱등성 필수**: 재전송이 가능한 쓰기는 **클라이언트 생성 UUID + `upsert`**로 만든다. `insert`였다면 재시도가 일기를 **복제**한다. (`saveDiaryAction`이 생성/수정 공용 upsert)
- `created_at`은 upsert 컬럼에 넣지 않는다 → 수정 시 보존.
- 언마운트 후에도 동작해야 하므로 `queryClient`/`toast`처럼 **루트 프로바이더 소속** 객체만 백그라운드 콜백에서 쓴다.
- 재개(resume)는 `DiaryListContent`의 `useEffect`가 담당(로그인 보장된 위치).
- 관련 파일: `src/lib/diary/draft.ts`, `src/components/diary/diary-editor.tsx`.
- 트레이드오프: **last-write-wins**(다기기 동시 수정 시 재전송이 덮어씀), 새로고침 직후 미동기화 드래프트가 있으면 상세에 옛 내용이 잠깐 보일 수 있음(목록 진입 시 해소).

**3-2. `revalidatePath`는 "서버 렌더 데이터가 있는 라우트"에만**
React Query로 전환한 라우트(`/diary` 등)는 **인증만 하는 얇은 페이지**라 revalidate할 서버 데이터가 없다. 그런데 `revalidatePath`는 **클라이언트 Router Cache를 파괴**해서 `staleTimes` 이점을 스스로 날린다(전환이 다시 느려짐).
- ❌ 클라 페칭 라우트 → `revalidatePath` 쓰지 말 것 (일기 액션에서 제거함)
- ✅ 서버가 렌더하는 데이터가 남아있는 경우만 → 예: 대시보드 액션의 `revalidatePath('/dashboard')`는 레이아웃 nav(버킷 목록)를 갱신하므로 유지

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

### ⚠️ 클라이언트가 소유한 URL 상태는 shallow routing으로 갱신
**`?param=` 이 바뀌면 Router Cache 키가 달라져 `staleTimes`가 안 먹고 매번 RSC 왕복이 발생한다.** 그 왕복을 `useTransition`으로 감싸면 피드백(스피너/흐려짐)이 그 시간만큼 길어진다 — 실제로 버킷 탭이 이 문제였다.
- 데이터를 **클라이언트가 이미 URL에서 읽어 처리**하고 있다면(예: `useSearchParams` → `useDashboard(bucketId)`) **서버 왕복이 필요 없다**. Next 공식 **shallow routing**을 쓴다:
```ts
// ❌ RSC 왕복 발생 → useTransition 피드백이 길어짐
startSwitch(() => router.replace(`/dashboard?bucket=${id}`));

// ✅ 왕복 0회. history API는 Next Router와 통합되어 useSearchParams가 동기화된다
window.history.replaceState(null, "", `/dashboard?bucket=${id}`);
```
- 조건: **같은 라우트 내**에서만(pathname 변경엔 쓰지 말 것 — 렌더 트리와 URL이 어긋난다).
- 기다릴 게 없으므로 `useTransition`/`disabled`/`opacity` 피드백도 함께 제거한다. 로딩 피드백이 필요한 경우(캐시 미스)는 **지연 스켈레톤**이 담당.
- 사례: `src/components/navigation/bucket-switcher.tsx`.

### ⚠️ 같은 상태를 두 곳에서 각각 해석하지 말 것 — 해석 입력을 통일하라
버킷 선택이 실제로 이 버그를 냈다: **칩(`MainNavBar`)은 서버가 읽은 쿠키 prop**을, **콘텐츠(`DashboardLoader`)는 클라이언트 `document.cookie`** 를 보고 각자 해석 → `?bucket=` 없이 진입하면 **서로 다른 버킷**을 가리켰다.

**원인**: **서버가 읽은 값(prop)은 요청 시점에 박제**된다. 쿠키는 렌더 후 클라이언트가 쓰므로(`useTrackLastViewedBucket`) 한 박자 늦고, `staleTimes`로 셸이 캐시되면 더 오래 낡는다. **shallow routing 전환 후엔 레이아웃이 아예 재렌더되지 않아 세션 내내 낡는다.**

**해결**: 소비자들이 **같은 입력**(URL > **클라이언트에서 읽은 쿠키** > buckets[0])으로 해석하게 한다. 쿠키 읽기는 한 곳(`readLastViewedBucketCookie()`)에서 제공하고, 서버 prop은 **SSR 첫 페인트 시드**로만 쓴다(제거하면 SSR에서 쿠키를 못 읽어 하이드레이션 불일치).
```ts
// MainNavBar — 마운트 후 실제 쿠키로 교체 (SSR 시드는 prop)
const [clientCookieBucketId, setClientCookieBucketId] = useState<string | null>(null);
useEffect(() => { setClientCookieBucketId(readLastViewedBucketCookie()); }, [searchParams, buckets]);
const effectiveCookieBucketId = clientCookieBucketId ?? cookieSelectedBucketId;
```

> 🚫 **시도했다가 폐기한 방법**: "해석 결과를 `history.replaceState`로 URL에 승격"은 그럴듯했지만 **Next 라우터를 깨뜨렸다**. `replaceState(null, ...)`이 Next가 `window.history.state`에 보관하는 내부 상태(`__NA`, 라우터 트리)를 지워 **`useSearchParams`가 얼어붙고 이후 모든 칩 전환이 먹통**이 됐다(실측: URL은 바뀌는데 하이라이트가 영영 안 움직임).
> **교훈**: `history.replaceState`는 **사용자 이벤트 핸들러에서 URL 값을 실제로 바꿀 때만**(예: 칩 클릭) 쓰고, **effect에서 라우터 상태를 뒤에서 고쳐 쓰지 말 것.**

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
2. 변경(뮤테이션)? → 서버액션 + 캐시 갱신. **먼저 dirty 체크**(변경 없으면 호출 금지) → 결과를 알면 `setQueryData`, 모르면 `invalidateQueries`(**최소 범위**). optimistic이면 `await`. 클라 페칭 라우트엔 `revalidatePath` 금지.
3. 공유 UI 상태? → 로컬이면 `useState`, 진짜 전역이면 Zustand(서버데이터 금지).
4. 북마크/공유 상태? → `searchParams`.
5. 로딩 UI? → `useDelayedFlag`(300ms). `loading.tsx` 만들지 말 것.

## 측정 / 디버깅
- 재방문 즉시성: 네트워크 탭에서 재방문 시 서버액션/RSC 재요청이 없는지 확인.
- 지연 임계값: 로더 진입 직후 `[aria-label*="로딩 중"]` 존재 여부를 폴링.
- (선택) React Query Devtools: `@tanstack/react-query-devtools`.
