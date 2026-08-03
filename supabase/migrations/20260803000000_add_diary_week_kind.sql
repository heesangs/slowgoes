-- 주간 기록의 종류 구분 (20260803)
--
-- 지금까지는 week_start IS NOT NULL 하나로 "주간 회고"를 판정했다. 주간 목표가
-- 생기면서 같은 주에 두 종류의 기록이 공존하므로 구분자를 둔다.
-- NULL = 기존 회고(하위 호환) — 읽는 쪽은 NULL을 'review'로 취급한다.
ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS week_kind text
    CHECK (week_kind IS NULL OR week_kind IN ('goal', 'review'));

-- 기존 주간 기록은 전부 회고
UPDATE public.diaries
SET week_kind = 'review'
WHERE week_start IS NOT NULL AND week_kind IS NULL;

COMMENT ON COLUMN public.diaries.week_kind IS
  'goal=주간 목표, review=주간 회고. week_start가 있을 때만 의미가 있다(NULL은 회고로 간주)';
