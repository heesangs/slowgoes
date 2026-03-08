# slowgoes — 개발자 문서

> 이 문서는 slowgoes 앱의 전체 아키텍처, 인증 플로우, 프론트엔드 구조, 유저 워크플로우, DB 연동을 개발 관점에서 정리한다.
> 개선 작업 시 Claude에게 컨텍스트로 제공하기 위한 목적이다.

---

## 1. 프로젝트 개요

**slowgoes**는 한국 학생 대상의 AI 기반 학습 과제 관리 앱이다.

- 핵심 철학: "나의 속도로, 천천히" — 어려운 건 넉넉하게, 쉬운 건 빠르게
- AI가 난이도를 분석하고 시간을 제안하지만, 최종 결정은 사용자가 한다
- 과제 → AI 분해 → 사용자 조정 → 실행 → 리뷰의 워크플로우

### 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 |
| 인증 | Supabase Auth (이메일/비밀번호) |
| 데이터베이스 | Supabase Postgres + RLS |
| AI | Google Gemini API (gemini-2.0-flash) |
| 배포 | Vercel |
| 패키지 매니저 | pnpm |
| 폰트 | Geist Sans / Geist Mono (Google Fonts) |

---

## 2. 라우팅 & 페이지 구조

### 라우트 그룹

```
src/app/
├── layout.tsx              # 루트 레이아웃 (ToastProvider, 폰트 설정)
├── globals.css             # Tailwind v4 + CSS 변수 (라이트/다크 테마)
├── page.tsx                # 랜딩 페이지 (/)
│
├── (auth)/                 # 인증 관련 라우트 그룹 (레이아웃 없음)
│   ├── actions.ts          # 서버 액션: signUp, signIn, signOut, saveProfile
│   ├── login/page.tsx      # 로그인 (/login) — 클라이언트 컴포넌트
│   ├── signup/page.tsx     # 회원가입 (/signup) — 클라이언트 컴포넌트
│   └── onboarding/page.tsx # 온보딩 (/onboarding) — 서버 컴포넌트
│
└── (main)/                 # 인증된 사용자용 라우트 그룹
    ├── layout.tsx          # 공통 레이아웃 (헤더: 로고, 프로필 아이콘, 로그아웃)
    ├── dashboard/
    │   ├── page.tsx        # 대시보드 (/dashboard) — 서버 컴포넌트
    │   └── loading.tsx     # 스켈레톤 로딩 UI
    ├── tasks/
    │   ├── actions.ts      # 서버 액션: 과제 CRUD + AI 분석 + 메모 템플릿
    │   ├── new/page.tsx    # 과제 생성 (/tasks/new) — 서버 컴포넌트
    │   └── [id]/page.tsx   # 과제 상세 (/tasks/[id]) — 서버 컴포넌트
    └── profile/
        ├── page.tsx        # 프로필 (/profile) — 서버 컴포넌트
        └── actions.ts      # 서버 액션: 프로필 수정, 비밀번호 변경
```

### 서버/클라이언트 구분

| 페이지 | 컴포넌트 타입 | 역할 |
|--------|-------------|------|
| `/` | 서버 | 랜딩 (정적 마크업) |
| `/login` | **클라이언트** | 이메일 localStorage 연동, 폼 상태 관리 |
| `/signup` | **클라이언트** | 비밀번호 확인 검증, 폼 상태 관리 |
| `/onboarding` | 서버 → 클라이언트 자식 | 인증 확인 후 OnboardingForm 렌더 |
| `/dashboard` | 서버 → 클라이언트 자식 | DB에서 과제 조회 후 DashboardContent 렌더 |
| `/tasks/new` | 서버 → 클라이언트 자식 | 인증 확인 후 TaskCreator 렌더 |
| `/tasks/[id]` | 서버 → 클라이언트 자식 | DB에서 과제+subtask 조회 후 TaskDetailView 렌더 |
| `/profile` | 서버 → 클라이언트 자식 | 프로필+통계 조회 후 ProfileContent 렌더 |

### 레이아웃 계층

```
RootLayout (ToastProvider, 폰트, html lang="ko")
├── (auth) 페이지 → 레이아웃 없음 (전체 화면)
└── (main) MainLayout (헤더 + max-w-2xl 컨테이너)
    └── 각 페이지
```

---

## 3. 인증 시스템

### Supabase 클라이언트 설정

**3개의 클라이언트**가 용도별로 존재한다:

| 파일 | 용도 | 사용처 |
|------|------|--------|
| `src/lib/supabase/server.ts` | 서버 측 (Server Components, Server Actions) | 쿠키 기반 세션 관리 |
| `src/lib/supabase/client.ts` | 클라이언트 측 (브라우저) | 직접 Supabase 호출 시 |
| `src/lib/supabase/middleware.ts` | 미들웨어 전용 | 요청마다 세션 갱신 |

### 미들웨어 (`src/middleware.ts`)

- 모든 요청(정적 파일 제외)에서 `updateSession()` 호출
- `supabase.auth.getUser()`로 세션 갱신 → 쿠키 재설정
- 매칭 패턴: `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`

### 인증 플로우

```
[회원가입]
1. /signup → signUpAction(email, password)
2. supabase.auth.signUp() 호출
3-a. 이메일 인증 필요 → "인증 메일 확인" 메시지 표시
3-b. 세션 생성됨 → redirect("/onboarding")

[로그인]
1. /login → signInAction(email, password)
2. supabase.auth.signInWithPassword() 호출
3. 성공 → data.user에서 userId 추출
4. profiles 테이블에서 프로필 존재 여부 확인 (.maybeSingle())
5-a. 프로필 있음 → redirect("/dashboard")
5-b. 프로필 없음 → redirect("/onboarding")

[로그아웃]
1. signOutAction() → supabase.auth.signOut() → redirect("/")
```

### 로그인 에러 핸들링 (`mapSignInError`)

| 조건 | 사용자 메시지 |
|------|-------------|
| 429 / rate limit | "요청이 많아 잠시 제한되었어요" |
| email not confirmed | "이메일 인증이 완료되지 않았어요" |
| fetch failed / network | "네트워크 연결이 불안정해" |
| 400 + invalid credentials | "이메일 또는 비밀번호가 올바르지 않습니다" |
| 401, 403 | "로그인 권한을 확인할 수 없습니다" |
| 500+ | "서버 오류로 로그인에 실패했습니다" |
| 기타 | "로그인 중 오류가 발생했습니다" |

### 로그인 UX 최적화

- `isNextRedirectError()` 헬퍼로 Next.js redirect 에러를 감지 → 재throw
- `finally` 블록 제거 → 성공 경로에서 로딩 상태 유지 (redirect 완료까지)
- 이메일 localStorage 자동 저장 (`slowgoes_saved_email` 키)
- `dashboard/loading.tsx` 스켈레톤으로 전환 UX 제공

### 인증 가드 패턴

모든 (main) 서버 컴포넌트 페이지에서 동일 패턴 사용:

```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
```

서버 액션에서는 `getAuthUserId()` 유틸로 통일:

```typescript
async function getAuthUserId() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: user.id };
}
```

---

## 4. 온보딩 플로우

### 페이지: `/onboarding` (서버 컴포넌트)

1. 인증 확인 → 미인증 시 `/login`
2. 프로필 존재 확인 → 이미 있으면 `/dashboard`
3. `<OnboardingForm />` 렌더링

### OnboardingForm (클라이언트 컴포넌트): 4단계

**Step 1 — 닉네임**: `display_name` 입력 (필수)

**Step 2 — 사용 목적**: `user_context` 복수 선택
- `student` (중·고등학생), `university` (대학생), `work` (직장인), `personal` (개인)

**Step 3 — 세부 설정**: 선택된 context에 따라 동적 UI
- `student` → 학년 (중1~고3), 과목 (국어, 영어, 수학, 과학, 사회, 기타)
- `university` → 학년 (1~4학년, 대학원), 전공 (인문, 사회, 경영, 공학 등)
- `work` → 분야 (개발, 디자인, 마케팅, 기획, 영업 등)
- `personal` → 관심사 (독서, 운동, 어학, 자격증, 창작 등)

**Step 4 — 나의 속도**: `self_level` 선택
- `low` (천천히 꼼꼼히), `medium` (보통 속도), `high` (빠르게 집중)

### 프로필 저장 (`saveProfileAction`)

- `display_name` 트림 + 빈값 검증
- `user_context` JSON 배열 파싱 + 허용값 검증
- `subjects` JSON 배열 파싱 + 중복 제거
- `self_level` 허용값 검증 (low/medium/high)
- `supabase.from("profiles").upsert(...)` → redirect("/dashboard")

---

## 5. 대시보드

### 서버 컴포넌트 데이터 페칭 (`/dashboard/page.tsx`)

```typescript
// 사용자의 모든 과제 + 하위 과제를 한번에 조회
const { data: tasks } = await supabase
  .from("tasks")
  .select("*, subtasks(*)")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false });
```

- 과제 없음 → `<DashboardEmpty>` (빈 상태 + 과제 생성 CTA)
- 과제 있음 → `<DashboardContent>` (과제 목록)
- 조회 실패 → `<DashboardContent>` + `fetchError` 표시

### DashboardContent (클라이언트 컴포넌트)

**Props**: `tasks: TaskWithSubtasks[]`, `displayName: string | null`, `fetchError?: string`

**주요 기능**:
- 인사 메시지: "안녕하세요, {displayName}님" + 요약 (과제 N개, 하위과제 M개, 총 시간)
- 과제 분류:
  - **진행 중**: `in_progress` 먼저, 그 다음 `pending`
  - **완료**: `completed` (접기/펼치기 가능)
- **Optimistic Delete**: 삭제 즉시 UI에서 제거 → 서버 삭제 → 실패 시 롤백
- **삭제 확인**: 첫 클릭 = 확인 요청, 3초 이내 재클릭 = 실행, 3초 후 자동 리셋
- **FAB (Floating Action Button)**: 화면 하단 우측 고정 `+` 버튼 → `/tasks/new`

### TaskCard (클라이언트 컴포넌트)

- 과제 제목 + 상태 표시
- 난이도 배지 (easy/medium/hard 개수)
- 진행률 바 (완료 subtask / 전체 subtask)
- 예상 시간 표시
- 카드 클릭 → `/tasks/[id]`로 이동
- 삭제 버튼 (hover 시 표시)

### 스켈레톤 로딩 (`loading.tsx`)

- Next.js Suspense boundary 활용
- CardSkeleton × 3 + 제목/설명 스켈레톤
- `animate-pulse` 애니메이션

---

## 6. 과제 생성 (AI 연동)

### 전체 플로우

```
/tasks/new (서버) → 인증 확인 + profile.user_context 조회
  → <TaskCreator> (클라이언트) 렌더
    → Phase 1: input (TaskInputForm)
    → Phase 2: analyzing (AI 호출 중, 스피너)
    → Phase 3: editing (SubtaskList로 결과 편집)
    → Phase 4: saving (DB 저장 중)
    → 저장 완료 → /tasks/[id]로 이동
```

### TaskCreator — `useReducer` 상태 머신

```
Phase: input → analyzing → editing → saving
       ↑                      │
       └── RESET ─────────────┘

Actions:
- START_ANALYZE → input → analyzing
- ANALYZE_SUCCESS → analyzing → editing (subtasks 데이터 설정)
- CHANGE_DIFFICULTY → editing 내 subtask 난이도 변경
- CHANGE_TIME → editing 내 subtask 시간 변경
- START_DECOMPOSE → editing 내 subtask decompose 시작
- DECOMPOSE_SUCCESS → editing 내 subtask에 children 추가
- START_SAVE → editing → saving
- RESET → any → input
```

### TaskInputForm

**기본 입력**:
- 과제 제목 (필수, 자동 포커스)
- "더 자세히" 접기/펼치기 섹션

**확장 입력 (더 자세히)**:
- **메모** (textarea, 최대 500자) — AI 분석 힌트로 전달
- **메모 템플릿**: 태그 UI, 클릭으로 메모에 삽입, 현재 메모 저장 가능
- **희망 하위과제 수**: 칩 (3, 5, 7, 10, 또는 AI 추천)
- **목표 소요 시간**: 칩 (30분, 1시간, 2시간, 3시간+, 또는 AI 추천)
- **마감일**: 날짜 선택 (최소값 = 오늘)

**user_context별 플레이스홀더 예시**:
- student → "수학 중간고사 범위 정리"
- university → "경영학 기말 레포트 작성"
- work → "신규 기능 디자인 시안 작성"
- personal → "토익 단어 100개 암기"

### AI 분석 (`src/lib/ai/analyze.ts`)

**analyzeTask(title, profile, hints)** → 3~7개 subtask 제안

프롬프트 구성:
1. **System Identity** — user_context별 동적:
   - student only → "한국 학생의 학습을 돕는 AI 튜터"
   - university → "대학생의 과제와 학습을 돕는 AI 조수"
   - work → "업무 효율을 돕는 AI 어시스턴트"
   - multi-context → "할 일을 효율적으로 관리하도록 돕는 AI"

2. **Profile Context** — 학년, 과목, self_level 정보 주입

3. **규칙**:
   - 쉬운 과제 → 짧은 시간 (빠르게 처리)
   - 어려운 과제 → 여유로운 시간 (무리하지 않게)
   - 각 subtask: 최소 5분, 최대 120분
   - self_level에 따라 시간 조정

4. **힌트** (optional): 메모, 희망 개수, 목표 시간, 마감일

**decomposeSubtask(parentTitle, taskTitle, profile)** → 2~4개 마이크로 스텝
- 동일 프롬프트 구조, 더 세밀한 분해
- 각 스텝: 최소 5분, 최대 60분

**응답 처리**:
- JSON 파싱 + 마크다운 코드 펜스 제거
- `estimated_minutes` 클램핑: `Math.max(5, Math.min(120, Math.round(...)))`
- Gemini 에러 → 한국어 사용자 메시지 매핑

### SubtaskList / SubtaskCard

- top-level subtask (depth 0) 목록 표시
- 각 카드: 제목 + 난이도 토글 (easy/medium/hard) + 시간 ±5분 스테퍼
- "더 나누기" 버튼: depth < 2일 때만 표시, AI 재분해 호출
- 하위 subtask는 재귀적 렌더링 (ml-4 들여쓰기)
- 전체 예상 시간 합계 표시 (리프 노드만)

### 과제 저장

`saveTaskAction()` → `supabase.rpc("save_task_with_subtasks", {...})`

- 클라이언트에서 `crypto.randomUUID()`로 task_id, subtask temp_id 생성
- 리프 노드만 합산하여 `total_estimated_minutes` 계산
- RPC 함수가 단일 트랜잭션으로 task + subtasks 원자적 삽입
- 저장 성공 → `router.push("/tasks/{taskId}")`

---

## 7. 과제 실행 (상세 뷰)

### 페이지: `/tasks/[id]` (서버 컴포넌트)

```typescript
const { data: task } = await supabase
  .from("tasks")
  .select("*, subtasks(*)")
  .eq("id", id)
  .eq("user_id", user.id)
  .single();
```

- 과제 없음 또는 다른 사용자 → `notFound()`
- `<TaskDetailView task={task} />` 렌더링

### TaskDetailView (클라이언트 컴포넌트)

**진행률 추적**:
- 프로그레스 바 (완료/전체)
- 난이도 분포 배지 (easy, medium, hard 개수)

**타이머 시스템**:
- 수동 시작/일시정지 버튼
- 경과 시간 표시 (h:m:s 형식)
- 첫 subtask 완료 시 자동 시작

**자동 완료 로직**: 모든 subtask 완료 → task.status = "completed"

### SubtaskCheckItem (클라이언트 컴포넌트)

- 체크박스 토글 (completed ↔ pending) → `toggleSubtaskAction()` 호출
- Optimistic UI: 즉시 체크 상태 변경 → 서버 동기화 → 실패 시 롤백
- 완료된 항목: 취소선 스타일
- **실제 소요 시간 입력**: 클릭하면 ±5분 스테퍼 표시 → `updateActualMinutesAction()`
- 재귀적 렌더링 (하위 subtask 트리 구조)

### toggleSubtaskAction 상세 로직

```
1. 소유권 확인 (assertTaskOwnership)
2. subtask status 업데이트 (completed_at 설정/해제)
3. 해당 task의 모든 subtask 상태 조회
4. task status 결정:
   - 전부 completed → task = "completed"
   - 하나라도 completed/in_progress → task = "in_progress"
   - 전부 pending → task = "pending"
5. task status + completed_at 업데이트
```

---

## 8. 프로필 & 통계

### 페이지: `/profile` (서버 컴포넌트)

```typescript
const { data: profile } = await supabase.from("profiles").select("*")...
const stats = await getTaskStats(supabase, user.id);
// → <ProfileContent profile={profile} email={email} stats={stats} />
```

### ProfileContent (클라이언트 컴포넌트)

**섹션 1 — 기본 정보**:
- 아바타 (닉네임 첫 글자)
- 닉네임 수정 (최대 10자)
- user_context 토글 (복수 선택)
- context별 학년/과목 선택 (온보딩과 동일 UI)
- self_level 변경
- `updateProfileAction()` 호출

**섹션 2 — 과제 통계** (TaskStatsSection):
- 과제 현황: 전체, 완료, 진행중, 완료율
- 하위과제 완료율 바
- 시간 정확도: 예상 vs 실제 비교 바
- 난이도 분포: easy/medium/hard 비율 바

**섹션 3 — 계정 관리**:
- 이메일 표시 (읽기 전용)
- 비밀번호 변경 (접기/펼치기, 확인 입력, `changePasswordAction()`)
- 로그아웃 버튼

### getTaskStats 집계 로직 (`src/lib/stats.ts`)

```
1. 모든 tasks + subtasks 조회
2. 과제 수: total, completed, in_progress
3. subtask 수: total, completed
4. 시간 합산: tasks 테이블의 total_estimated_minutes, total_actual_minutes
5. 난이도 분포: 완료된 리프 subtask만 집계
   - 리프 노드 = parent_subtask_id로 참조되지 않는 subtask
```

---

## 9. 데이터베이스 스키마

### 테이블 구조

```sql
profiles (
  id uuid PK REFERENCES auth.users,     -- Supabase Auth 사용자 ID
  display_name text,
  grade text,                             -- "고1", "중3" 등
  subjects text[],                        -- ["수학", "영어"]
  self_level text DEFAULT 'medium',       -- low | medium | high
  user_context text[] DEFAULT '{}',       -- ["student", "work"]
  created_at timestamptz DEFAULT now()
)

tasks (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid FK → profiles(id),
  title text NOT NULL,
  status text DEFAULT 'pending',          -- pending | in_progress | completed
  total_estimated_minutes int,            -- 리프 노드 합산
  total_actual_minutes int,               -- 리프 노드 합산
  memo text,                              -- 과제 메모
  desired_subtask_count int,              -- 사용자 희망 subtask 수
  target_duration_minutes int,            -- 사용자 목표 시간
  due_date date,                          -- 마감일
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)

subtasks (
  id uuid PK DEFAULT gen_random_uuid(),
  task_id uuid FK → tasks(id) ON DELETE CASCADE,
  parent_subtask_id uuid FK → subtasks(id) ON DELETE CASCADE, -- 재귀 분해
  depth int DEFAULT 0,                    -- 최대 2
  title text NOT NULL,
  difficulty text NOT NULL,               -- easy | medium | hard
  ai_suggested_difficulty text,           -- AI 원본 제안
  estimated_minutes int NOT NULL,         -- 사용자 확정 시간
  ai_suggested_minutes int,               -- AI 원본 제안
  actual_minutes int,                     -- 실제 소요 시간
  sort_order int DEFAULT 0,
  status text DEFAULT 'pending',          -- pending | in_progress | completed
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)

memo_templates (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid FK → profiles(id) ON DELETE CASCADE,
  label text NOT NULL,                    -- 템플릿 표시 이름
  content text NOT NULL,                  -- 메모 내용
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
)
```

### RLS 정책

모든 테이블에 Row Level Security 적용. 사용자는 자신의 데이터만 접근 가능.

| 테이블 | 정책 | 조건 |
|--------|------|------|
| profiles | SELECT/INSERT/UPDATE/DELETE | `(select auth.uid()) = id` |
| tasks | SELECT/INSERT/UPDATE/DELETE | `(select auth.uid()) = user_id` |
| subtasks | SELECT/INSERT/UPDATE/DELETE | `EXISTS (select 1 from tasks where tasks.id = subtasks.task_id and tasks.user_id = (select auth.uid()))` |
| memo_templates | SELECT/INSERT/UPDATE/DELETE | `auth.uid() = user_id` |

### RPC 함수: `save_task_with_subtasks`

```sql
-- 과제 + 하위 과제를 단일 트랜잭션으로 원자적 삽입
save_task_with_subtasks(
  p_task_id uuid,
  p_user_id uuid,
  p_title text,
  p_total_estimated_minutes integer,
  p_subtasks jsonb,
  p_memo text DEFAULT NULL,
  p_desired_subtask_count integer DEFAULT NULL,
  p_target_duration_minutes integer DEFAULT NULL,
  p_due_date date DEFAULT NULL
)
```

- `SECURITY DEFINER` — 함수 소유자 권한으로 실행
- auth.uid() ≠ p_user_id면 에러 발생
- p_subtasks JSONB 배열을 순회하며 subtask INSERT
- 하나라도 실패하면 전체 롤백

### 마이그레이션 이력

| 파일 | 내용 |
|------|------|
| `20260217123000_create_save_task_with_subtasks_rpc.sql` | RPC 함수 생성 |
| `20260218123843_optimize_rls_policies.sql` | 인덱스 추가, RLS 성능 최적화 |
| `20260218220000_fix_split_rls_policy_performance.sql` | RLS 정책 분리 (SELECT/INSERT/UPDATE/DELETE 개별화) |
| `20260222000000_add_user_context_to_profiles.sql` | profiles에 user_context 컬럼 추가 |
| `20260222100000_add_task_optional_fields.sql` | tasks에 memo, desired_subtask_count 등 추가 + RPC 업데이트 |
| `20260307000000_create_memo_templates.sql` | memo_templates 테이블 + RLS 생성 |

### 리프 노드 계산

시간 합산과 난이도 통계에서 **리프 노드**만 사용한다:

```typescript
// 부모로 참조되는 subtask ID 수집
const parentIds = new Set(
  allSubtasks.filter(s => s.parent_subtask_id).map(s => s.parent_subtask_id)
);
// 리프 노드 = parentIds에 포함되지 않는 subtask
const leaves = allSubtasks.filter(s => !parentIds.has(s.id));
```

이유: depth 0 subtask이 재분해되면, 원래 subtask의 시간과 하위 subtask 시간이 중복 합산되는 것을 방지.

---

## 10. UI 컴포넌트 시스템

### 컴포넌트 목록

| 컴포넌트 | 파일 | 주요 Props |
|----------|------|-----------|
| `Button` | `src/components/ui/button.tsx` | `variant` (primary/secondary/ghost), `size` (sm/md/lg), `isLoading` |
| `Input` | `src/components/ui/input.tsx` | `label`, `error`, `onClear`, 표준 input props |
| `Card` | `src/components/ui/card.tsx` | `CardHeader`, `CardContent` 하위 컴포넌트 |
| `Toast` | `src/components/ui/toast.tsx` | `ToastProvider` (루트), `useToast()` 훅 |

### Toast 시스템

```typescript
const { toast } = useToast();
toast({ type: "success", message: "저장되었습니다" });
toast({ type: "error", message: "오류가 발생했습니다" });
```

- 3초 후 자동 dismiss
- 화면 하단 중앙 고정 (max-w-sm)
- 여러 토스트 수직 스택

### 디자인 토큰 (CSS 변수)

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

- Tailwind CSS v4 `@theme inline`으로 커스텀 색상 주입
- `foreground/10`, `foreground/60` 등 opacity 변형 활용
- 난이도 색상: 쉬움 `#22C55E` (green-500), 보통 `#EAB308` (yellow-500), 어려움 `#EF4444` (red-500)

---

## 11. 서버 액션 목록

### `src/app/(auth)/actions.ts`

| 함수 | 시그니처 | 역할 |
|------|---------|------|
| `signUpAction` | `(formData: FormData) → { error?, message? }` | 회원가입 |
| `signInAction` | `(formData: FormData) → { error? }` | 로그인 → redirect |
| `signOutAction` | `() → void` | 로그아웃 → redirect("/") |
| `saveProfileAction` | `(formData: FormData) → { error? }` | 온보딩 프로필 저장 → redirect("/dashboard") |

### `src/app/(main)/tasks/actions.ts`

| 함수 | 시그니처 | 역할 |
|------|---------|------|
| `deleteTaskAction` | `(taskId) → { success, error? }` | 과제 삭제 (CASCADE) |
| `analyzeTaskAction` | `(data: TaskInputData) → { success, data?, error? }` | AI 과제 분해 |
| `decomposeSubtaskAction` | `(parentTitle, taskTitle) → { success, data?, error? }` | AI subtask 재분해 |
| `toggleSubtaskAction` | `(subtaskId, taskId, newStatus) → { success, error? }` | subtask 상태 토글 + task 자동 완료 |
| `updateActualMinutesAction` | `(subtaskId, taskId, minutes) → { success, error? }` | 실제 소요 시간 기록 |
| `saveTaskAction` | `(data) → { success, taskId?, error? }` | task + subtasks 원자적 저장 (RPC) |
| `getMemoTemplatesAction` | `() → { success, data?, error? }` | 메모 템플릿 목록 조회 |
| `saveMemoTemplateAction` | `(label, content) → { success, data?, error? }` | 메모 템플릿 저장 |
| `deleteMemoTemplateAction` | `(templateId) → { success, error? }` | 메모 템플릿 삭제 |

### `src/app/(main)/profile/actions.ts`

| 함수 | 시그니처 | 역할 |
|------|---------|------|
| `updateProfileAction` | `(formData: FormData) → { error? }` | 프로필 정보 수정 |
| `changePasswordAction` | `(formData: FormData) → { error? }` | 비밀번호 변경 |

### 내부 헬퍼 함수 (tasks/actions.ts)

| 함수 | 역할 |
|------|------|
| `getAuthUserId()` | 인증 확인 + supabase 클라이언트 반환 |
| `getProfile()` | userId로 프로필 조회 |
| `assertTaskOwnership()` | 과제 소유권 확인 |
| `toClientErrorMessage()` | 서버 에러 → 안전한 사용자 메시지 변환 (180자 제한, Gemini URL 필터링) |

---

## 12. 유틸리티 & 헬퍼

### `src/lib/utils.ts`

```typescript
cn(...classes)              // 클래스명 조건부 결합
formatMinutes(minutes)      // 분 → "X시간 Y분" 형식
difficultyConfig            // easy/medium/hard별 라벨, 색상, Tailwind 클래스
getDifficultyConfig(diff)   // 난이도에 맞는 config 반환
```

### `src/lib/stats.ts`

```typescript
getTaskStats(supabase, userId) → TaskStats
// 전체 과제 + subtask 통계 집계
// 리프 노드만으로 난이도 분포 계산
```

---

## 13. 컴포넌트 파일 구조

```
src/components/
├── ui/
│   ├── button.tsx          # Button (variant, size, isLoading)
│   ├── input.tsx           # Input (label, error, onClear)
│   ├── card.tsx            # Card, CardHeader, CardContent
│   └── toast.tsx           # ToastProvider, useToast
├── auth/
│   ├── onboarding-form.tsx # 4단계 온보딩 폼
│   └── sign-out-button.tsx # 로그아웃 버튼
├── dashboard/
│   ├── dashboard-content.tsx  # 과제 목록 + Optimistic Delete
│   ├── dashboard-empty.tsx    # 빈 상태
│   └── task-card.tsx          # 과제 카드 (진행률, 난이도, 시간)
├── task/
│   ├── task-creator.tsx       # 과제 생성 오케스트레이터 (useReducer)
│   ├── task-input-form.tsx    # 입력 폼 (메모, 템플릿, 힌트)
│   ├── subtask-list.tsx       # subtask 목록
│   ├── subtask-card.tsx       # subtask 카드 (난이도 토글, 시간 조절)
│   ├── task-detail-view.tsx   # 과제 실행 뷰 (체크리스트, 타이머)
│   └── subtask-check-item.tsx # 체크 아이템 (토글, 실제 시간 입력)
└── profile/
    ├── profile-content.tsx    # 프로필 편집 + 계정 관리
    └── task-stats.tsx         # 통계 카드 (완료율, 시간, 난이도)
```

---

## 14. 현재 구현 상태

### MVP v0.1 범위 대비 완성도

| 기능 | 상태 | 비고 |
|------|------|------|
| 과제 입력 (텍스트) | ✅ 완료 | 메모, 힌트 확장 입력 포함 |
| AI 분해 + 난이도 + 시간 제안 | ✅ 완료 | Gemini 연동 완료 |
| 사용자 난이도/시간 조정 | ✅ 완료 | 토글 + 스테퍼 UI |
| 재귀적 subtask 분해 (depth 2) | ✅ 완료 | "더 나누기" 기능 |
| Subtask 체크리스트 | ✅ 완료 | 토글 + 실제 시간 입력 |
| 인증 + 온보딩 | ✅ 완료 | 이메일/비밀번호 + 4단계 프로필 |
| 대시보드 | ✅ 완료 | 과제 목록, 삭제, 스켈레톤 |
| 프로필 관리 | ✅ 완료 | 정보 수정, 통계, 비밀번호 변경 |
| 메모 템플릿 | ✅ 완료 | 저장/불러오기/삭제 |

### 미구현 / 개선 가능 영역

- **리뷰 페이지** (`/review`): 라우트 존재하지 않음 — 예상 vs 실제 시간 비교 분석
- **체험하기 기능**: 비로그인 데모 모드 (계획 수립 완료, 미구현)
- **과제 수정**: 생성된 과제의 제목/subtask 사후 수정 불가
- **정렬/필터**: 대시보드에서 날짜, 상태, 난이도별 정렬/필터 없음
- **알림/리마인더**: 마감일 기반 알림 없음
- **데이터 내보내기**: 통계 CSV/PDF 내보내기 없음
- **소셜 로그인**: 이메일/비밀번호만 지원
- **PWA**: 오프라인 지원 없음
- **다국어**: 한국어 하드코딩 (i18n 미적용)

---

## 15. 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=     # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Supabase anon key
GOOGLE_AI_API_KEY=             # Gemini API 키 (서버 전용)
GEMINI_MODEL=                  # 모델명 (기본: gemini-2.0-flash)
```

---

## 16. 유저 워크플로우 요약

```
[신규 사용자]
랜딩(/) → 시작하기 → 로그인(/login) → 회원가입(/signup)
→ 이메일 인증 → 로그인 → 온보딩(/onboarding) 4단계
→ 대시보드(/dashboard)

[과제 생성]
대시보드 → FAB(+) 클릭 → /tasks/new
→ 제목 입력 (+선택: 메모, 힌트)
→ AI 분석 (2~5초)
→ subtask 목록 확인/편집 (난이도 토글, 시간 조절, 재분해)
→ 저장 → /tasks/[id]

[과제 실행]
대시보드 → 카드 클릭 → /tasks/[id]
→ subtask 체크리스트 체크
→ 실제 소요 시간 입력 (선택)
→ 모든 subtask 완료 → 과제 자동 완료

[프로필 관리]
헤더 프로필 아이콘 → /profile
→ 닉네임/목적/과목/속도 변경
→ 과제 통계 확인
→ 비밀번호 변경

[기존 사용자 재방문]
로그인 → 프로필 있음 → /dashboard 직행
```
