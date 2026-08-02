-- 일기 ↔ 주(week)·버킷 연결.
--
-- week_start : 주간 회고면 그 주의 시작일(일요일). 일반 일기는 NULL.
--              created_at은 "쓴 시각"이라 백데이팅이 안 되므로, "어느 주에 대한
--              회고인가"를 담을 자리를 따로 둔다(지난 주 회고를 이번 주에 써도 됨).
-- bucket_id  : 회고를 쓴 시점의 버킷. 일기 목록에서 #버킷명으로 표시한다.
--              todos와 같은 관례 — nullable + ON DELETE SET NULL(버킷을 지워도 일기는 남는다).
-- UNIQUE는 걸지 않는다: 한 주에 버킷별로 여러 회고가 있을 수 있다.
-- RLS는 기존 diaries_all_own 정책이 컬럼까지 커버.
-- 롤백: ALTER TABLE public.diaries DROP COLUMN week_start, DROP COLUMN bucket_id;

ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS bucket_id uuid REFERENCES public.buckets(id) ON DELETE SET NULL;

-- 주간 회고 조회용 부분 인덱스 (전체 일기의 소수만 회고이므로 partial)
CREATE INDEX IF NOT EXISTS idx_diaries_user_week
  ON public.diaries (user_id, week_start)
  WHERE week_start IS NOT NULL;

COMMENT ON COLUMN public.diaries.week_start IS '주간 회고 대상 주의 시작일(일요일). NULL이면 일반 일기.';
COMMENT ON COLUMN public.diaries.bucket_id IS '작성 시점 버킷 — 목록에서 #버킷명 표시용.';
