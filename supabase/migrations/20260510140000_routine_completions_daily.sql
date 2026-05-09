-- PR 22: 루틴 달성을 일 단위로 기록 (기존 주 단위 → 일 단위).
-- PDF "2.d. 루틴의 달성기록 확인 - 캘린더뷰를 활용해 내가 달성한 날짜를 직관적으로 확인한다."
-- 의 데이터 모델 기반.
--
-- 변경:
--   1) completion_date date 컬럼 추가
--   2) 기존 row의 week_start를 completion_date로 백필
--      (정확한 날짜 정보는 lost — 주 단위 그대로 캘린더에 표시됨)
--   3) UNIQUE 제약: (routine_id, week_start) → (routine_id, completion_date)
--   4) week_start 컬럼은 호환성 위해 유지 (별도 cleanup PR로 제거 가능)
--
-- 롤백:
--   - completion_date 컬럼 DROP + UNIQUE 원복으로 복구 가능
--   - 단 일 단위로 새로 쌓인 기록의 정밀도는 lost

-- 1. completion_date 컬럼 추가 (nullable로 시작)
ALTER TABLE public.routine_completions
  ADD COLUMN IF NOT EXISTS completion_date date;

-- 2. 기존 row 백필 (week_start로 채움)
UPDATE public.routine_completions
   SET completion_date = week_start
 WHERE completion_date IS NULL;

-- 3. NOT NULL 제약
ALTER TABLE public.routine_completions
  ALTER COLUMN completion_date SET NOT NULL;

-- 4. UNIQUE 제약 변경
ALTER TABLE public.routine_completions
  DROP CONSTRAINT IF EXISTS routine_completions_routine_id_week_start_key;

ALTER TABLE public.routine_completions
  DROP CONSTRAINT IF EXISTS routine_completions_routine_id_completion_date_key;

ALTER TABLE public.routine_completions
  ADD CONSTRAINT routine_completions_routine_id_completion_date_key
  UNIQUE (routine_id, completion_date);

-- 5. 인덱스 (캘린더 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_routine_completions_routine_date
  ON public.routine_completions(routine_id, completion_date);

COMMENT ON COLUMN public.routine_completions.completion_date IS
  'PR 22: 루틴 완료 일자 (일 단위 캘린더 뷰용). 기존 row는 week_start로 백필됨.';
