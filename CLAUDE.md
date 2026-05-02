# slowgoes

## Philosophy

나의 속도로, 천천히.

직선적 시간관은 생존에 유리하지만 과하면 자신을 갈아넣어 건강을 잃거나 병이 찾아오고
원형적 시간관은 여유와 행복이 있지만 과하면 무기력과 우울이 온다.
둘 사이의 적절한 조화가 필요하다.

페인포인트 : 뭘 해야할지 모르겠는 사람들. 일중독.
솔루션 : 정언적으로(이미 증명된 사실처럼 확고하게) 가설을 세우고 조금씩 실행하면서 나를 증명해나가기.
추상적인 삶의 장면을 AI가 시간의 지평(언젠가 → 1년 → 시즌 → 이번 주) + 루틴 + 데일리 투두로 분해해준다.
AI가 제안하고, 유저가 결정하고 실행한다.

## Core Flow

```
Landing → Login/Signup (또는 체험판 /demo)
  → 온보딩 Step 1: Life Clock (나이, 성별, MBTI 4축 — E/I·S/N·T/F·J/P)
  → 온보딩 Step 2: 삶의 장면 선택/입력
  → 온보딩 Step 3: AI 분석 → 시간의 지평 + 루틴 + 데일리 투두 생성
  → Dashboard (데일리 투두, 루틴, 라이프 클락)
```

### 체험판 (Demo)

```
/demo → 온보딩 폼 (mode="demo") → localStorage 저장
  → /demo/complete (결과 확인) → 회원가입 유도
```

## Target Users

- 자신의 삶을 주도적으로 설계하고 싶은 사람 (학생, 대학생, 직장인 등)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS v4 |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| AI | Google Gemini API (gemini-2.0-flash) |
| Deploy | Vercel |
| Package Manager | pnpm |

## Project Structure

```
slowgoes/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Login / Signup / Onboarding
│   │   ├── (main)/
│   │   │   ├── dashboard/       # 메인 대시보드 (라이프 클락, 투두, 루틴)
│   │   │   ├── buckets/         # 삶의 장면 관리
│   │   │   ├── tasks/           # 태스크 생성 & 상세
│   │   │   ├── actions/         # 행동 로그
│   │   │   ├── review/          # 회고 & 리뷰
│   │   │   └── profile/         # 프로필
│   │   ├── auth/callback/       # OAuth 콜백
│   │   ├── demo/                # 체험판 (로그인 불필요)
│   │   ├── layout.tsx
│   │   └── page.tsx             # 랜딩 페이지
│   ├── components/
│   │   ├── ui/                  # Button, Input, Card, Toast, BottomSheet
│   │   ├── auth/                # 온보딩 폼, 로그아웃, 체험판 데이터 마이그레이션
│   │   ├── dashboard/           # Dashboard v2, 라이프 클락, 태스크 카드
│   │   ├── task/                # 태스크 생성기, 서브태스크 컴포넌트
│   │   ├── buckets/             # 버킷 페이지
│   │   ├── profile/             # 프로필, 통계
│   │   ├── review/              # 리뷰 페이지
│   │   ├── actions/             # 행동 콘텐츠
│   │   └── layout/
│   ├── lib/
│   │   ├── supabase/            # Client & Server 설정, 미들웨어
│   │   ├── ai/                  # Gemini API: 장면 분석(analyze.ts), 클라이언트(gemini.ts)
│   │   ├── dashboard/           # 대시보드 데이터 쿼리
│   │   ├── onboarding/          # 체험판 장면 데이터
│   │   ├── demo/                # 체험판 localStorage 저장
│   │   ├── flags.ts             # 피처 플래그
│   │   ├── stats.ts             # 통계 유틸
│   │   └── utils.ts
│   ├── hooks/
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
  display_name text,
  grade text,                              -- e.g. "고1", "중3" (레거시)
  subjects text[],                         -- (레거시)
  self_level text DEFAULT 'medium',        -- low | medium | high
  user_context text[] DEFAULT '{}',        -- student | university | work | personal
  life_clock_age integer,
  gender text,                             -- male | female
  personality_type text,                   -- MBTI 4글자 (ISTJ | INFP | ENFJ | ... 16가지)
  pace_type text,                          -- slow | balanced | focused | recovery
  onboarding_version integer DEFAULT 1,    -- 1 | 2
  created_at timestamptz DEFAULT now()
)

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
  horizon text DEFAULT 'someday',          -- someday | this_year | this_season
  status text DEFAULT 'not_started',       -- not_started | in_progress | completed | paused
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)

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

daily_todos (
  id uuid PK,
  user_id uuid FK → profiles(id),
  bucket_id uuid FK → buckets(id),
  title text NOT NULL,
  status text DEFAULT 'pending',           -- pending | completed
  source text DEFAULT 'onboarding',        -- onboarding | ai_generated | manual
  action_tip text,                         -- AI 생성 행동 팁
  action_tip_generated_at timestamptz,
  week_start date,                         -- 주간 그룹핑 키
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)

routines (
  id uuid PK,
  user_id uuid FK → profiles(id),
  bucket_id uuid FK → buckets(id),
  title text NOT NULL,
  source text DEFAULT 'onboarding',        -- onboarding | ai_generated | manual
  repeat_unit text DEFAULT 'weekly',       -- daily | weekly
  repeat_value integer DEFAULT 1,          -- 반복 횟수 (1~31)
  action_tip text,
  action_tip_generated_at timestamptz,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

routine_completions (
  id uuid PK,
  routine_id uuid FK → routines(id) ON DELETE CASCADE,
  user_id uuid FK → profiles(id),
  week_start date,
  completed_at timestamptz DEFAULT now(),
  UNIQUE (routine_id, week_start)          -- 루틴당 주 1회 완료
)

horizon_analyses (
  id uuid PK,
  user_id uuid FK → profiles(id),
  bucket_id uuid FK → buckets(id) ON DELETE CASCADE,
  life_area text NOT NULL,
  empathy_message text DEFAULT '',
  horizons jsonb DEFAULT '[]',             -- [{level, label, action}]
  suggested_routines jsonb DEFAULT '[]',   -- [{title, repeatUnit, repeatValue}]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id)                       -- 버킷당 1개 분석
)
```

### 기존 유지 테이블

```sql
tasks (
  id uuid PK,
  user_id uuid FK → profiles(id),
  title text NOT NULL,
  status text DEFAULT 'pending',           -- pending | in_progress | completed
  total_estimated_minutes int,
  total_actual_minutes int,
  memo text,
  chapter_id uuid FK → chapters(id),
  bucket_id uuid FK → buckets(id),
  is_daily_step boolean DEFAULT false,
  condition text,                          -- light | normal | focused | tired
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)

subtasks (
  id uuid PK,
  task_id uuid FK → tasks(id) ON DELETE CASCADE,
  parent_subtask_id uuid FK → subtasks(id),  -- 재귀 분해용
  depth int DEFAULT 0,                        -- max 2
  title text NOT NULL,
  difficulty text NOT NULL,                   -- easy | medium | hard
  ai_suggested_difficulty text,
  estimated_minutes int NOT NULL,
  ai_suggested_minutes int,
  actual_minutes int,
  sort_order int DEFAULT 0,
  status text DEFAULT 'pending',              -- pending | in_progress | completed
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)
```

### 부가 테이블

- `action_logs` — 데일리 투두/루틴 완료 기록 + AI 회고 어드바이스
- `memo_templates` — 사용자별 메모 템플릿
- `difficulty_adjustments` — AI 난이도/시간 예측 vs 유저 최종 조정 이력 (AI 학습용)

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
- Subtask recursive decomposition: max depth 2
- 서비스 핵심 용어(버킷/데일리 투두/루틴/나의 발걸음/나의 시간/숨은 나 찾기)는 `FEATURE_NAMES` 상수 사용 — 자세한 가이드는 `DEVELOPER.md`의 "Brand Naming & FEATURE_NAMES" 섹션 참조
