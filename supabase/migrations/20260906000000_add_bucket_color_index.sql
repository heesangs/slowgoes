-- 버킷 색 (Figma bucket_list_color 37959:45112 — 앞에서부터 1~7)
--
-- 일생 캘린더에서 "그 버킷을 붙들었던 구간"을 색으로 칠하기 위한 값.
-- 여러 버킷을 동시에 굴린 기간은 색이 겹쳐 섞이므로, 버킷마다 색이 달라야 읽힌다.
--
-- NULL = 아직 직접 고르지 않음 → 등록 순서(created_at)에서 파생한다(1~7 순환).
--   파생을 DB DEFAULT 로 두지 않는 이유: 순서는 "그 사용자의 몇 번째 버킷인가"라
--   행 하나만 봐서는 알 수 없다. 파생은 앱의 resolveBucketColorIndex 한 곳에서만 한다.
--   (src/lib/buckets/color.ts — 서버·클라이언트가 같은 함수를 쓴다)
--
-- 롤백: ALTER TABLE public.buckets DROP COLUMN color_index;

ALTER TABLE public.buckets
  ADD COLUMN IF NOT EXISTS color_index smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'buckets_color_index_range'
  ) THEN
    ALTER TABLE public.buckets
      ADD CONSTRAINT buckets_color_index_range
      CHECK (color_index IS NULL OR color_index BETWEEN 1 AND 7);
  END IF;
END $$;

COMMENT ON COLUMN public.buckets.color_index IS
  '버킷 색 1~7 (Figma bucket_list_color). NULL이면 등록 순서에서 파생.';
