-- PR 10: 실행계획 카드(이번 시즌/이번 달/이번 주/오늘)에 투두를 통합 표시하기 위해
-- daily_todos에 stride_level 컬럼 추가.
--
-- 4가지 값만 허용: 'today' | 'this_week' | 'this_month' | 'this_season'
--   (지향점 레벨인 someday/this_year/five_years/decade는 daily_todos가 아닌 stride_plan에 표현)
--
-- 백필 정책:
--   기존 daily_todos는 모두 'today'로 백필. 사용자가 추후 수정/이동할 수 있음.
--   향후 신규 투두는 한걸음 더 흐름(PR 12)에서 사용자가 명시적으로 기간을 선택해 INSERT.
--
-- 롤백: 컬럼 DROP만으로 복구 가능 (기존 컬럼 변경 없음).

ALTER TABLE public.daily_todos
  ADD COLUMN IF NOT EXISTS stride_level text NOT NULL DEFAULT 'today';

-- CHECK 제약: 4가지 값만 허용
ALTER TABLE public.daily_todos
  DROP CONSTRAINT IF EXISTS daily_todos_stride_level_check;
ALTER TABLE public.daily_todos
  ADD CONSTRAINT daily_todos_stride_level_check
  CHECK (stride_level IN ('today', 'this_week', 'this_month', 'this_season'));

-- 기간별 카드 그룹 조회 최적화
CREATE INDEX IF NOT EXISTS idx_daily_todos_bucket_stride_level
  ON public.daily_todos(bucket_id, stride_level);
