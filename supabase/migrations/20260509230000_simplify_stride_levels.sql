-- PR 18: 실행계획 카드 4개(오늘/이번 주/이번 달/이번 시즌) → 1개(이번 달)로 축소.
-- daily_todos.stride_level이 인지부하만 늘리고 사용자가 실행계획에서 단일 그룹만
-- 보길 원하므로 'this_month' 단일 값으로 축소.
--
-- 백필 정책:
--   today, this_week, this_season에 속한 모든 row를 this_month로 이동.
--   기존 사용자가 등록한 투두는 보존 (loss of granularity는 의도된 것).
--
-- 롤백: CHECK 제약을 다시 확장하고 백필 데이터를 분리할 수는 없음 (loss).
--       그러나 stride_level 컬럼은 유지되어 컬럼 DROP은 불필요.

-- 1. 기존 데이터 백필
UPDATE public.daily_todos
   SET stride_level = 'this_month'
 WHERE stride_level IN ('today', 'this_week', 'this_season');

-- 2. CHECK 제약 축소
ALTER TABLE public.daily_todos
  DROP CONSTRAINT IF EXISTS daily_todos_stride_level_check;

ALTER TABLE public.daily_todos
  ADD CONSTRAINT daily_todos_stride_level_check
  CHECK (stride_level = 'this_month');

-- 3. DEFAULT도 'this_month'로 변경 (기존 'today'였을 수 있음)
ALTER TABLE public.daily_todos
  ALTER COLUMN stride_level SET DEFAULT 'this_month';
