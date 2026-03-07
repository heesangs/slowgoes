-- 메모 템플릿 테이블 생성
CREATE TABLE public.memo_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  content text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS 활성화
ALTER TABLE public.memo_templates ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 데이터만 조회
CREATE POLICY "select_own" ON public.memo_templates
  FOR SELECT USING (auth.uid() = user_id);

-- RLS 정책: 본인만 삽입
CREATE POLICY "insert_own" ON public.memo_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS 정책: 본인만 삭제
CREATE POLICY "delete_own" ON public.memo_templates
  FOR DELETE USING (auth.uid() = user_id);

-- RLS 정책: 본인만 수정
CREATE POLICY "update_own" ON public.memo_templates
  FOR UPDATE USING (auth.uid() = user_id);
