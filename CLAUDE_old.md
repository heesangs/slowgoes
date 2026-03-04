# slowgoes

## Philosophy

Your pace, not the world's.
Hard things get generous time. Easy things move fast.
AI analyzes difficulty and suggests time — the user makes the final call.

## Core Flow

```
Task input → AI decomposes into subtasks + suggests difficulty & time
→ User reviews & adjusts → Execute (subtask checklist + estimated time)
→ Complete & review (estimated vs actual)
```

## Target Users

- Students (study, assignments, exam prep)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| AI | Google Gemini API |
| Deploy | Vercel |
| Package Manager | pnpm |

## Project Structure

```
slowgoes/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login / Signup route group
│   │   ├── (main)/
│   │   │   ├── dashboard/    # Today's task summary
│   │   │   ├── tasks/        # Task creation & management
│   │   │   └── review/       # Review & statistics
│   │   ├── layout.tsx
│   │   └── page.tsx          # Landing page
│   ├── components/
│   │   ├── ui/               # Base UI (Button, Input, Card, etc.)
│   │   ├── task/             # Task-related components
│   │   └── layout/           # Header, Sidebar, Navigation
│   ├── lib/
│   │   ├── supabase/         # Supabase client & server config
│   │   ├── ai/               # Difficulty analysis, task decomposition
│   │   └── utils.ts
│   ├── hooks/
│   ├── types/
│   └── styles/
├── supabase/
│   └── migrations/
├── public/
├── CLAUDE.md
├── .env.local                # git-ignored
└── package.json
```

## Data Model

```sql
profiles (
  id uuid PK REFERENCES auth.users,
  display_name text,
  created_at timestamptz DEFAULT now()
)

tasks (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid FK → profiles(id),
  title text NOT NULL,
  status text DEFAULT 'pending',    -- pending | in_progress | completed
  total_estimated_minutes int,
  total_actual_minutes int,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)

subtasks (
  id uuid PK DEFAULT gen_random_uuid(),
  task_id uuid FK → tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  difficulty text NOT NULL,         -- easy | medium | hard
  ai_suggested_difficulty text,
  estimated_minutes int NOT NULL,   -- user-confirmed
  ai_suggested_minutes int,
  actual_minutes int,
  sort_order int DEFAULT 0,
  status text DEFAULT 'pending',    -- pending | in_progress | completed
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
)
```

## Design Principles

1. **Ease, not pressure** — Show estimated time as a guide, not a countdown
2. **Simplicity** — UI understandable within 3 seconds
3. **My pace** — AI suggests, user decides
4. **Visual difficulty** — Easy(🟢), Medium(🟡), Hard(🔴) via color

## Rules

- Comments in Korean
- Component-driven development (single responsibility)
- Prefer Server Components; use 'use client' only when necessary
- Tailwind utility classes only (no inline styles)
- Centralize types in `types/` directory
- Error handling required (try-catch + user feedback)
- AI API calls must be in Server Actions or Route Handlers only
- All user-facing text in Korean

## MVP Scope (v0.1)

1. Task input (text field)
2. AI decomposes into subtasks + suggests difficulty + estimated time
3. User adjusts difficulty & time
4. Subtask checklist view
5. Auth (Supabase Auth - email/password)
