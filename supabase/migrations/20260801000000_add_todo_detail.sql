-- 할 일 세부정보(todos.detail): 투두 제목 아래에 붙는 한 줄 메모.
--
-- detail : 자유 텍스트(선택). 대시보드 행에서 제목 아래 회색 한 줄로 표시하고,
--          입력창의 [세부정보 추가] 줄에서 작성한다. 체크 가능한 하위 목록이 아니라
--          단순 텍스트이므로 별도 테이블 없이 컬럼 하나로 충분하다.
-- RLS는 기존 todos 정책이 컬럼까지 커버(별도 정책 불필요).
-- 롤백: ALTER TABLE public.todos DROP COLUMN detail;

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS detail text;

COMMENT ON COLUMN public.todos.detail IS '할 일 세부정보 — 제목 아래 한 줄 메모(자유 텍스트, 선택).';
