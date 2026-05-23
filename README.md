# slowgoes

> 나의 속도로, 천천히. — AI가 추상적인 삶의 장면을 시간의 지평 + 루틴 + 데일리투두로 분해해주고, 사용자가 결정하고 실행한다.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind v4 |
| Auth/DB | Supabase (Postgres + Auth + RLS) |
| AI | Google Gemini API (`gemini-2.0-flash`) |
| Deploy | Vercel |
| Package Manager | pnpm |

자세한 아키텍처/도메인 가이드는 [`CLAUDE.md`](./CLAUDE.md) 참조.

## Quick Start

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경변수 세팅
cp .env.example .env.local
# .env.local 열어서 Supabase URL/키 + Gemini API 키 채우기

# 3. dev 서버
pnpm dev   # http://localhost:3000
```

### 필수 환경변수

| Key | 발급처 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 동일 위치 (anon/public) |
| `SUPABASE_SERVICE_ROLE_KEY` | 동일 위치 (service_role) — 서버 액션 전용 |
| `GOOGLE_AI_API_KEY` | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-2.0-flash` (기본) |

`SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` 는 로컬 마이그레이션용(선택).

## Scripts

| 명령 | 용도 |
|---|---|
| `pnpm dev` | 개발 서버 (Turbopack) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 빌드 결과 실행 |
| `pnpm lint` | ESLint |
| `pnpm exec tsc --noEmit` | 타입 검증 |

## Database

- 스키마/마이그레이션: [`supabase/migrations/`](./supabase/migrations/)
- 마이그레이션 적용 (Supabase CLI 사용):
  ```bash
  pnpm dlx supabase db push --project-ref <YOUR_PROJECT_REF>
  ```
- 또는 Supabase Dashboard → SQL Editor에서 직접 실행

## CI

`.github/workflows/ci.yml` — 모든 PR + main push에서 자동:
- `pnpm install --frozen-lockfile`
- `pnpm exec tsc --noEmit`
- `pnpm next build` (더미 env로 빌드 검증)

## 원격 작업 (Claude Code Dispatch)

이 리포는 [Claude Code Dispatch](https://claude.com/claude-code) 환경에서 모바일로 원격 작업 가능하도록 정비되어 있어요.

**Dispatch에서 작업 시 확인 사항:**
- [ ] Dispatch 프로젝트 설정에서 GitHub `heesangs/slowgoes` 연결
- [ ] 환경변수(`SUPABASE_ACCESS_TOKEN` 등)는 Dispatch 프로젝트 시크릿에 등록
  (.env.local은 dispatch 환경에 자동 동기화되지 않음)
- [ ] 권한 (`Bash`, `mcp__supabase__*`, `mcp__github__*`)은 Dispatch UI의 권한 패널에서 사전 허용
- [ ] PR 생성/머지는 dispatch가 자동으로 수행 — GitHub branch protection 규칙은 dispatch가 통과할 수 있도록 설정

**작업 패턴 권장:**
- 변경은 항상 `claude/<짧은-설명>` 브랜치로 분기 → PR → CI 통과 → 머지
- DB 스키마 변경은 반드시 `supabase/migrations/` 파일로 — 직접 SQL 실행은 추적 불가
- 큰 변경은 PR을 작게 쪼개기 — main을 안정 상태로 유지

## License

Private.
