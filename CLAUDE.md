# slowgoes

## Philosophy

나의 속도로, 나를 찾는시간 - slowgoes

솔루션 : 정언적으로(이미 증명된 사실처럼 확고하게) 가설을 세우고 조금씩 실행하면서 나를 증명해나가기.
추상적인 삶의 장면을 AI가 시간의 지평(언젠가 → 1년 → 시즌 → 이번 주) + 루틴 + 데일리 투두로 분해해서 유저의 실행력을 높인다.
(전제) AI는 제안만 하고 유저가 결정하고 실행한다.

**앱의 목적**: 여러 버킷을 병렬로 달성하는 앱이 아니다. **하나의 버킷에 집중해 자신의 행동력(실천력)을 높이는 것**이 목적이다. 따라서 UI는 단일 버킷 중심으로 설계한다(현재 버킷 카드가 중심, 버킷 전환은 보조 동선). 캘린더 고도화(주 단위 → 일생 캘린더)는 인지부하를 줄이면서 주 단위의 시간으로 인생을 더 넓은 시야에서 보게 하려는 의도다.

## Core Flow

```
Landing → Login/Signup (또는 체험판 /demo)
  → 온보딩 Step 1: Life Clock (나이, 성별, MBTI 4축 — E/I·S/N·T/F·J/P)
  → 온보딩 Step 2: 숨은 나 찾기 - 버킷 선정
  → 온보딩 Step 3: AI 분석 제안 → 나의 발걸음 + 루틴 + 데일리 투두 생성
  → Dashboard (데일리 투두, 루틴, 라이프 클락)
```

### 체험판 (Demo)

```
/demo → 온보딩 폼 (mode="demo") → localStorage 저장
  → 결과 확인 → 회원가입 유도
```

## Target Users

- 자신의 삶을 주도적으로 설계하고 싶은 사람

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS v4 |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| AI | Google Gemini API — `@google/generative-ai` (기본 `gemini-2.0-flash`, env `GEMINI_MODEL`로 override) |
| Deploy | Vercel |
| Package Manager | pnpm (`pnpm@10.6.5`) |

## Project Structure

```
slowgoes/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Login / Signup / Onboarding
│   │   │   ├── login/ · signup/ · onboarding/
│   │   │   └── actions.ts       # 인증 서버 액션
│   │   ├── (main)/
│   │   │   ├── dashboard/       # 메인 대시보드 (라이프 클락, 투두, 루틴) — page.tsx + actions.ts
│   │   │   ├── actions/         # ⚠️ 폐기 진행 중 → /dashboard로 흡수 (commit d981268)
│   │   │   ├── review/          # 회고 & 리뷰
│   │   │   ├── profile/         # 프로필 — page.tsx + actions.ts
│   │   │   └── layout.tsx
│   │   ├── api/keep-alive/      # Supabase 자동 정지 방지 cron (route.ts)
│   │   ├── auth/callback/       # OAuth 콜백 (route.ts)
│   │   ├── demo/                # 체험판 (로그인 불필요) — page.tsx + actions.ts
│   │   ├── layout.tsx
│   │   └── page.tsx             # 랜딩 페이지
│   ├── components/
│   │   ├── ui/                  # button, card, input, bottom-sheet, segment-control, toast, more-actions-menu
│   │   ├── auth/                # 온보딩 폼, 로그아웃, 체험판 데이터 배너/마이그레이터
│   │   │   └── onboarding/      # step-profile, step-scene, step-analysis, step-confirm
│   │   ├── dashboard/           # dashboard-content-v2, life-clock-header, direction-section,
│   │   │                        #   execution-plan-section, insight-section, step-sheet,
│   │   │                        #   routine-calendar-sheet, explore-new-scene-sheet, life-balance-card
│   │   ├── navigation/          # bucket-switcher
│   │   ├── profile/             # profile-content, task-stats
│   │   ├── review/              # review-page-content, routine-completion-ring, weekday-pattern-chart
│   │   └── layout/              # main-header, main-nav-bar
│   ├── lib/
│   │   ├── supabase/            # client.ts / server.ts / middleware.ts
│   │   ├── ai/                  # gemini.ts(클라이언트) · analyze.ts(장면 분석/추천)
│   │   ├── constants/           # brand.ts(FEATURE_NAMES) · errors.ts · index.ts
│   │   ├── dashboard/           # queries.ts · index.ts (대시보드 데이터 쿼리)
│   │   ├── onboarding/          # demo-scenes.ts (체험판 장면 데이터)
│   │   ├── demo/                # storage.ts (체험판 localStorage 저장)
│   │   ├── utils/               # period.ts (기간 유틸)
│   │   ├── flags.ts             # 피처 플래그 (onboarding_v2, dashboard_v2)
│   │   ├── stats.ts             # 통계 유틸 (회고/프로필)
│   │   └── utils.ts
│   ├── hooks/                   # use-life-scene-analysis, use-onboarding-draft,
│   │                            #   use-onboarding-submit, use-track-last-viewed-bucket
│   ├── types/
│   │   └── index.ts             # 공유 타입 정의
│   └── styles/
├── supabase/
│   └── migrations/
├── public/
├── CLAUDE.md
├── .env.local                   # git-ignored
└── package.json
```

## Data Model

### 핵심 테이블

```sql
profiles (
  id uuid PK REFERENCES auth.users,
  display_name text NOT NULL,
  life_clock_age integer,
  gender text,                             -- male | female
  personality_type text,                   -- MBTI 4글자 (ISTJ | INFP | ENFJ | ... 16가지)
  pace_type text,                          -- slow | balanced | focused | recovery
  onboarding_version integer DEFAULT 1,    -- 1 | 2
  created_at timestamptz DEFAULT now()
)
-- 레거시 컬럼(grade, subjects, self_level, user_context)은 20260510203000에서 DROP됨

life_areas (
  id uuid PK,
  user_id uuid FK → profiles(id),
  name text NOT NULL,                      -- e.g. 건강 | 관계 | 성장 | 경험 | 일 | 내면 | 돈
  icon text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

buckets (
  id uuid PK,
  user_id uuid FK → profiles(id),
  life_area_id uuid FK → life_areas(id),
  title text NOT NULL,                     -- 삶의 장면 텍스트
  stride_scope text DEFAULT 'someday',     -- today | this_week | this_month | this_season
                                           --   | this_year | five_years | decade | someday
  status text DEFAULT 'not_started',       -- not_started | in_progress | completed | paused
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)
-- 활성 버킷 unique 인덱스: (user_id, life_area_id, title) WHERE status NOT IN ('completed','paused')

chapters (
  id uuid PK,
  user_id uuid FK → profiles(id),
  bucket_id uuid FK → buckets(id),
  title text NOT NULL,
  description text,
  status text DEFAULT 'active',            -- active | completed | paused
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
)

todos (                                    -- 투두/루틴 통합 (20260718). 반복 여부만 다른 하나의 "할 일"
  id uuid PK,
  user_id uuid FK → profiles(id),
  bucket_id uuid FK → buckets(id) ON DELETE SET NULL,
  title text NOT NULL,
  source text DEFAULT 'manual',            -- onboarding | ai_generated | manual
  scheduled_date date NOT NULL,            -- 반복 없으면 "이 날짜의 할 일", 반복 있으면 시작 기준일
  repeat_type text,                        -- NULL(1회성) | daily | weekly | monthly | yearly
  repeat_weekdays smallint[],              -- weekly 전용: 0(일)~6(토). 평일=[1..5], 주말=[0,6]
  repeat_month_day smallint,               -- monthly/yearly 전용: 1~31
  repeat_month smallint,                   -- yearly 전용: 1~12
  scheduled_time time,                     -- 표시용 시간 (선택)
  is_active boolean DEFAULT true,          -- 반복 할 일 삭제 = false (기록 보존)
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
)
-- 발생일 계산은 클라이언트 occursOn() (src/lib/todos/repeat.ts)
-- 1회성 미완료는 오늘 뷰로 이월(overdue rollover)

todo_completions (                         -- 완료는 일별 행으로 통일 (1회성/반복 공통)
  id uuid PK,
  todo_id uuid FK → todos(id) ON DELETE CASCADE,
  user_id uuid FK → profiles(id),
  completion_date date NOT NULL,
  completed_at timestamptz DEFAULT now(),
  UNIQUE (todo_id, completion_date)
)

stride_plans (                             -- 구 horizon_analyses (20260411 리네임)
  id uuid PK,
  user_id uuid FK → profiles(id),
  bucket_id uuid FK → buckets(id) ON DELETE CASCADE,
  life_area text NOT NULL,
  strides jsonb DEFAULT '[]',              -- 구 horizons. [{level, label, action}]
  suggested_routines jsonb DEFAULT '[]',   -- [{title, repeatUnit, repeatValue}]
  title_history jsonb DEFAULT '{}',        -- 타이틀 변경 이력 (20260507)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id)                       -- 버킷당 1개 분석
)
-- empathy_message 컬럼은 20260516에서 DROP됨

diaries (                                   -- 일기(저널) — TipTap 마크다운 (20260712)
  id uuid PK,
  user_id uuid FK → profiles(id) ON DELETE CASCADE,
  content text NOT NULL,                   -- TipTap 에디터 HTML 원문
  plain_text text NOT NULL,                -- 순수 텍스트 (목록 제목/미리보기용)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
-- 목록 인덱스: (user_id, created_at DESC). RLS: 본인(user_id=auth.uid())만 접근
```

### 레거시 (코드 미사용, 데이터 보존)

> ⚠️ 현재 코드에서 참조 없음 — 데이터 보존 목적으로만 테이블 유지.
> 신규 기능은 buckets / **todos / todo_completions** 체계를 사용한다.
> - v1 과제 시스템: tasks / subtasks
> - v2 투두·루틴 분리 시스템: daily_todos / routines / routine_completions
>   (20260718에서 todos로 통합 이관 — id 보존)

```sql
tasks (
  id uuid PK,
  user_id uuid FK → profiles(id),
  title text NOT NULL,
  status text DEFAULT 'pending',           -- pending | in_progress | completed
  total_estimated_minutes int,
  memo text,
  desired_subtask_count int,
  target_duration_minutes int,
  due_date date,
  chapter_id uuid FK → chapters(id),
  bucket_id uuid FK → buckets(id) ON DELETE SET NULL,
  is_daily_step boolean DEFAULT false,
  condition text,                          -- light | normal | focused | tired
  created_at timestamptz DEFAULT now()
)

subtasks (
  id uuid PK,
  task_id uuid FK → tasks(id) ON DELETE CASCADE,
  parent_subtask_id uuid FK → subtasks(id),  -- 재귀 분해용
  depth int DEFAULT 0,
  title text NOT NULL,
  difficulty text NOT NULL,                   -- easy | medium | hard
  ai_suggested_difficulty text,
  estimated_minutes int NOT NULL DEFAULT 0,
  ai_suggested_minutes int NOT NULL DEFAULT 0,
  sort_order int DEFAULT 0,
  status text DEFAULT 'pending',              -- pending | in_progress | completed
  created_at timestamptz DEFAULT now()
)
```

### 부가 테이블

- `action_logs` — 데일리 투두/루틴 완료 기록 + AI 회고 어드바이스 (`item_type`: daily_todo | routine, `item_id`, `title`, `ai_advice`, `completed_at`)
- `memo_templates` — 사용자별 메모 템플릿 (`label`, `content`, `sort_order`)

### 주요 RPC

- `save_onboarding_journey(...)` — 온보딩 결과(profile · life_area · bucket · chapter · stride_plan · daily_todos · routines) 일괄 저장 (멱등)
- `delete_my_account()` — 로그인 사용자의 모든 데이터 + auth 계정 삭제

## Design Principles

1. **Mobile-first responsive design** — base styles for mobile, scale up with breakpoints

## Rules

- Mobile-first: base styles for 375px, then md: (768px) and lg: (1024px) breakpoints
- Comments in Korean
- All user-facing text in Korean
- Component-driven development (single responsibility)
- Prefer Server Components; use 'use client' only when necessary
- Tailwind utility classes only (no inline styles)
- Centralize types in `types/` directory
- Error handling required (try-catch + user feedback)
- Toast notifications for user feedback (auto-dismiss 3s)
- AI API calls must be in Server Actions or Route Handlers only
- 서비스 핵심 용어(버킷/데일리 투두/루틴/나의 발걸음/나의 시간/숨은 나 찾기)는 `FEATURE_NAMES` 상수 사용 — 자세한 가이드는 `DEVELOPER.md`의 "Brand Naming & FEATURE_NAMES" 섹션 참조
- 성능·상태관리(React Query / Next.js 캐싱 / Zustand / 지연 스켈레톤)는 `PERFORMANCE.md` 참조 — 서버데이터=React Query, UI상태=Zustand, 로딩표시=`useDelayedFlag`(300ms), `loading.tsx` 신설 금지
