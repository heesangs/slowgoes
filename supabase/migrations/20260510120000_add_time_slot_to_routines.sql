-- PR 19: 루틴에 "시간대" 속성 추가.
-- PDF "2.b. 루틴을 생성할때 필요한 속성을 추가한다 - 시간설정"의 단순화 형태.
-- 정확한 시각(예: 08:30)이 아닌 시간대(아침/점심/저녁/밤)만 저장.
--
-- 알림은 별도 마일스톤 (PWA + Supabase Cron 등 인프라 필요).
--
-- 백필:
--   기존 routines는 모두 NULL (시간대 미설정). 사용자가 추후 ⋮ "수정" 등으로 추가 가능.
--
-- 롤백: 컬럼 DROP만으로 안전.

ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS time_slot text;

ALTER TABLE public.routines
  DROP CONSTRAINT IF EXISTS routines_time_slot_check;

ALTER TABLE public.routines
  ADD CONSTRAINT routines_time_slot_check
  CHECK (time_slot IS NULL OR time_slot IN ('morning', 'afternoon', 'evening', 'night'));

COMMENT ON COLUMN public.routines.time_slot IS
  'PR 19: 루틴 실행 시간대 (morning|afternoon|evening|night|NULL)';
