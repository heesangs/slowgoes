-- 일기 코멘트(diaries.comments): organize(AI) 응답을 일기에 붙여 보관.
--
-- comments : jsonb 배열. 각 원소 = { id, title, body, created_at }.
--   - title = 사용자가 누른 organize 버튼명(예: "어휘력 높이기") 또는 자유질문 텍스트.
--   - body  = AI 응답 본문.
-- 일기 본문(content/plain_text)과 분리 저장하는 이유: 재-organize 시 코멘트가
--   AI 입력(본문)에 섞이지 않게 하고, 목록 제목/미리보기에도 영향을 주지 않기 위함.
-- RLS는 기존 diaries_all_own 정책이 컬럼까지 커버(별도 정책 불필요).
-- 롤백: ALTER TABLE public.diaries DROP COLUMN comments;

ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.diaries.comments IS 'organize(AI) 코멘트 배열 [{id,title,body,created_at}]. 본문과 분리 — 재분석 시 제외.';
