-- 버킷 중복 생성 안전망 (2/2): partial unique index
-- 적용 전제: 활성(status NOT IN ('completed','paused')) 중복 버킷이 DB에 없어야 함.
--   기존 좀비 버킷이 있다면 /buckets UI에서 삭제 후 본 마이그레이션 적용.
--
-- 인덱스 의도:
--   동일 (user_id, life_area_id, title) 활성 버킷이 두 개 이상 존재하지 못하게 차단.
--   완료(completed) 또는 일시중지(paused) 상태는 "활성 슬롯을 점유하지 않음"으로 간주
--   → 같은 주제의 새 버킷을 다시 시작 가능.
--
-- 이 안전망은 클라이언트 분기와 RPC 멱등성이 깨지더라도 DB 레벨에서 마지막 방어선 역할.

CREATE UNIQUE INDEX IF NOT EXISTS buckets_user_lifearea_title_active_unique
  ON public.buckets (user_id, life_area_id, title)
  WHERE status NOT IN ('completed', 'paused');
