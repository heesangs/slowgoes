-- 일기(diaries) 기능: 사용자별 일기 저장 테이블.
--
-- content    : TipTap WYSIWYG 에디터가 생성한 HTML 원문
-- plain_text : editor.getText() 순수 텍스트 — 목록 제목/미리보기(향후 검색)용.
--              서버에서 HTML 파싱 없이 미리보기를 렌더하기 위해 분리 저장.
-- 롤백: DROP TABLE 만으로 안전.

CREATE TABLE IF NOT EXISTS public.diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  plain_text text NOT NULL CHECK (btrim(plain_text) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 목록 조회: 사용자별 최신순
CREATE INDEX IF NOT EXISTS idx_diaries_user_created
  ON public.diaries (user_id, created_at DESC);

-- RLS: 본인 데이터만 접근
ALTER TABLE public.diaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diaries_all_own" ON public.diaries;
CREATE POLICY "diaries_all_own" ON public.diaries
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.diaries IS '사용자 일기. content=TipTap HTML, plain_text=순수 텍스트(제목/미리보기용).';
