-- PR 15: 발걸음 카드 ⋮ "수정" 시트의 이력 picker를 위한 컬럼 추가.
--
-- 구조:
--   {
--     [stride_level]: [
--       { "title": "...", "generated_at": "ISO", "source": "ai" | "manual" },
--       ...
--     ]
--   }
--
-- 정책:
-- - 새 변경(수정/AI 재생성) 발생 시 기존 title을 history 배열의 앞에 prepend
-- - 시트는 최근 5개까지 표시 (server는 더 많이 누적해도 됨)
-- - 기존 stride_plan들은 빈 객체로 시작 → 수정 시점부터 누적
--
-- 롤백: 컬럼 DROP만으로 안전. 기존 strides 컬럼/현재 타이틀에는 영향 없음.

ALTER TABLE public.stride_plans
  ADD COLUMN IF NOT EXISTS title_history jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.stride_plans.title_history IS
  'PR 15: 발걸음 단계별 과거 타이틀 이력. { [level]: [{ title, generated_at, source }] }';
