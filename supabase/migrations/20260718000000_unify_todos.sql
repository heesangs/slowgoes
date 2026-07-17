-- 투두/루틴 통합 (Phase B)
--
-- 배경: 투두와 루틴의 실제 차이는 "반복 여부"와 "완료 기록 방식"뿐.
-- 하나의 todos 테이블로 통합하고, 완료는 todo_completions(일별 행)로 통일한다.
--   - 반복 없는 할 일: scheduled_date 하루에 표시, 완료 = completion 행 존재
--   - 반복 있는 할 일(구 루틴): repeat_type + 파라미터로 발생일 계산, 날짜별 완료
-- 기존 daily_todos/routines/routine_completions 테이블은 데이터 보존 목적으로 유지
-- (코드 참조는 제거됨 — CLAUDE.md 레거시 관례).
--
-- 요일 규약: 0=일요일 ~ 6=토요일 (JS getDay() = Postgres EXTRACT(DOW) 동일)
-- 반복 7옵션 매핑:
--   매일=daily / 매주(요일들)=weekly+repeat_weekdays / 평일=weekly+[1..5] / 주말=weekly+[0,6]
--   매월(일)=monthly+repeat_month_day / 매년(월.일)=yearly+repeat_month+repeat_month_day

-- 1) todos 테이블
CREATE TABLE IF NOT EXISTS public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket_id uuid REFERENCES public.buckets(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('onboarding', 'ai_generated', 'manual')),
  -- 반복 없으면 "이 날짜의 할 일", 반복 있으면 시작 기준일
  scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
  repeat_type text CHECK (repeat_type IN ('daily', 'weekly', 'monthly', 'yearly')),
  repeat_weekdays smallint[]
    CHECK (repeat_weekdays IS NULL OR (array_length(repeat_weekdays, 1) BETWEEN 1 AND 7)),
  repeat_month_day smallint CHECK (repeat_month_day BETWEEN 1 AND 31),
  repeat_month smallint CHECK (repeat_month BETWEEN 1 AND 12),
  -- 표시용 시간 (피그마 09:20). 선택.
  scheduled_time time,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  -- 반복 타입별 필수 파라미터 정합성
  CONSTRAINT todos_repeat_params_check CHECK (
    (repeat_type IS NULL AND repeat_weekdays IS NULL AND repeat_month_day IS NULL AND repeat_month IS NULL)
    OR (repeat_type = 'daily' AND repeat_weekdays IS NULL AND repeat_month_day IS NULL AND repeat_month IS NULL)
    OR (repeat_type = 'weekly' AND repeat_weekdays IS NOT NULL AND repeat_month_day IS NULL AND repeat_month IS NULL)
    OR (repeat_type = 'monthly' AND repeat_weekdays IS NULL AND repeat_month_day IS NOT NULL AND repeat_month IS NULL)
    OR (repeat_type = 'yearly' AND repeat_weekdays IS NULL AND repeat_month_day IS NOT NULL AND repeat_month IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS todos_user_bucket_idx ON public.todos (user_id, bucket_id);
CREATE INDEX IF NOT EXISTS todos_user_scheduled_idx ON public.todos (user_id, scheduled_date);

-- 2) todo_completions — 완료는 일별 행 (구 routine_completions 방식으로 통일)
CREATE TABLE IF NOT EXISTS public.todo_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  completed_at timestamptz DEFAULT now(),
  UNIQUE (todo_id, completion_date)
);

CREATE INDEX IF NOT EXISTS todo_completions_user_date_idx
  ON public.todo_completions (user_id, completion_date);

-- 3) RLS — 본인 데이터만
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todos_all_own ON public.todos;
CREATE POLICY todos_all_own ON public.todos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS todo_completions_all_own ON public.todo_completions;
CREATE POLICY todo_completions_all_own ON public.todo_completions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) action_logs.item_type에 'todo' 추가 (기존 daily_todo/routine 로그는 보존)
ALTER TABLE public.action_logs DROP CONSTRAINT IF EXISTS action_logs_item_type_check;
ALTER TABLE public.action_logs ADD CONSTRAINT action_logs_item_type_check
  CHECK (item_type IN ('daily_todo', 'routine', 'todo'));

-- 5) 데이터 이관 (id 보존 → completions 매핑이 그대로 유효, 멱등: ON CONFLICT DO NOTHING)

-- 5-1) daily_todos → todos (반복 없음)
INSERT INTO public.todos (
  id, user_id, bucket_id, title, source, scheduled_date,
  repeat_type, is_active, sort_order, created_at
)
SELECT
  dt.id, dt.user_id, dt.bucket_id, dt.title, dt.source,
  COALESCE(dt.completed_at::date, dt.week_start),
  NULL, true, dt.sort_order, dt.created_at
FROM public.daily_todos dt
ON CONFLICT (id) DO NOTHING;

-- 완료된 투두 → completion 행 생성
INSERT INTO public.todo_completions (todo_id, user_id, completion_date, completed_at)
SELECT dt.id, dt.user_id, dt.completed_at::date, dt.completed_at
FROM public.daily_todos dt
WHERE dt.status = 'completed' AND dt.completed_at IS NOT NULL
ON CONFLICT (todo_id, completion_date) DO NOTHING;

-- 5-2) routines → todos (반복 있음)
-- 구 weekly는 "주 N회"라 요일 개념이 없어 새 요일 모델로 정확히 이관 불가 → '매일'로
-- 근사 이관(사용자 조정 전제, 승인됨). time_slot은 대표 시간으로 근사 매핑.
INSERT INTO public.todos (
  id, user_id, bucket_id, title, source, scheduled_date,
  repeat_type, scheduled_time, is_active, sort_order, created_at
)
SELECT
  r.id, r.user_id, r.bucket_id, r.title, r.source,
  r.created_at::date,
  'daily',
  CASE r.time_slot
    WHEN 'morning' THEN time '09:00'
    WHEN 'afternoon' THEN time '14:00'
    WHEN 'evening' THEN time '19:00'
    WHEN 'night' THEN time '22:00'
    ELSE NULL
  END,
  r.is_active, r.sort_order, r.created_at
FROM public.routines r
ON CONFLICT (id) DO NOTHING;

-- 5-3) routine_completions → todo_completions (routine_id = todo_id 그대로)
INSERT INTO public.todo_completions (todo_id, user_id, completion_date, completed_at)
SELECT rc.routine_id, rc.user_id, rc.completion_date, rc.completed_at
FROM public.routine_completions rc
ON CONFLICT (todo_id, completion_date) DO NOTHING;

-- 6) 온보딩 RPC — daily_todos/routines 대신 todos에 저장 (시그니처 불변)
CREATE OR REPLACE FUNCTION public.save_onboarding_journey(
  p_user_id uuid,
  p_display_name text,
  p_life_clock_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_personality_type text DEFAULT NULL,
  p_pace_type text DEFAULT NULL,
  p_scene_text text DEFAULT NULL,
  p_life_area_name text DEFAULT NULL,
  p_chapter_title text DEFAULT NULL,
  p_bucket_stride_scope text DEFAULT 'someday',
  p_stride_plan jsonb DEFAULT '{}'::jsonb,
  p_daily_todos jsonb DEFAULT '[]'::jsonb,
  p_routines jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_life_area_id uuid;
  v_bucket_id uuid;
  v_bucket_is_new boolean := false;
  v_chapter_id uuid;
  v_scene_text text;
  v_life_area_name text;
  v_chapter_title text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION '요청 사용자 정보가 일치하지 않습니다.';
  END IF;

  v_scene_text := btrim(COALESCE(p_scene_text, ''));
  v_life_area_name := btrim(COALESCE(p_life_area_name, ''));
  v_chapter_title := btrim(COALESCE(p_chapter_title, ''));

  IF btrim(COALESCE(p_display_name, '')) = '' THEN
    RAISE EXCEPTION '닉네임을 입력해주세요.';
  END IF;
  IF p_life_clock_age IS NULL OR p_life_clock_age < 0 OR p_life_clock_age > 100 THEN
    RAISE EXCEPTION '나이 값이 올바르지 않습니다.';
  END IF;
  IF p_gender IS NULL OR p_gender NOT IN ('male', 'female') THEN
    RAISE EXCEPTION '성별 값이 올바르지 않습니다.';
  END IF;
  IF p_personality_type IS NULL OR p_personality_type NOT IN (
    'ISTJ','ISFJ','INFJ','INTJ',
    'ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP',
    'ESTJ','ESFJ','ENFJ','ENTJ'
  ) THEN
    RAISE EXCEPTION '성향 값이 올바르지 않습니다.';
  END IF;
  IF p_pace_type IS NULL OR p_pace_type NOT IN ('slow', 'balanced', 'focused', 'recovery') THEN
    RAISE EXCEPTION '페이스 값이 올바르지 않습니다.';
  END IF;
  IF v_scene_text = '' THEN
    RAISE EXCEPTION '삶의 장면이 비어 있습니다.';
  END IF;
  IF v_life_area_name = '' THEN
    RAISE EXCEPTION '삶의 영역이 비어 있습니다.';
  END IF;
  IF p_bucket_stride_scope IS NULL OR p_bucket_stride_scope NOT IN (
    'today','this_week','this_month','this_season',
    'this_year','five_years','decade','someday'
  ) THEN
    RAISE EXCEPTION '버킷 보폭 스코프 값이 올바르지 않습니다.';
  END IF;
  IF jsonb_typeof(p_daily_todos) <> 'array' THEN
    RAISE EXCEPTION 'daily_todos 형식이 올바르지 않습니다.';
  END IF;
  IF jsonb_typeof(p_routines) <> 'array' THEN
    RAISE EXCEPTION 'routines 형식이 올바르지 않습니다.';
  END IF;

  -- 프로필 upsert
  INSERT INTO public.profiles (
    id, display_name, life_clock_age, gender, personality_type, pace_type, onboarding_version
  )
  VALUES (
    p_user_id, btrim(p_display_name), p_life_clock_age, p_gender,
    p_personality_type, p_pace_type, 2
  )
  ON CONFLICT (id)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    life_clock_age = EXCLUDED.life_clock_age,
    gender = EXCLUDED.gender,
    personality_type = EXCLUDED.personality_type,
    pace_type = EXCLUDED.pace_type,
    onboarding_version = 2;

  -- 삶의 영역 upsert
  SELECT id INTO v_life_area_id
  FROM public.life_areas
  WHERE user_id = p_user_id AND name = v_life_area_name
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_life_area_id IS NULL THEN
    INSERT INTO public.life_areas (user_id, name, sort_order)
    VALUES (p_user_id, v_life_area_name, 0)
    RETURNING id INTO v_life_area_id;
  END IF;

  -- 버킷 멱등 처리
  SELECT id INTO v_bucket_id
  FROM public.buckets
  WHERE user_id = p_user_id
    AND life_area_id = v_life_area_id
    AND title = v_scene_text
    AND status NOT IN ('completed', 'paused')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_bucket_id IS NULL THEN
    INSERT INTO public.buckets (user_id, life_area_id, title, stride_scope, status)
    VALUES (p_user_id, v_life_area_id, v_scene_text, p_bucket_stride_scope, 'in_progress')
    RETURNING id INTO v_bucket_id;

    v_bucket_is_new := true;
  END IF;

  IF v_chapter_title = '' THEN
    v_chapter_title := v_scene_text || ' 이번 시즌 실행';
  END IF;

  IF v_bucket_is_new THEN
    INSERT INTO public.chapters (user_id, bucket_id, title, status, start_date)
    VALUES (p_user_id, v_bucket_id, v_chapter_title, 'active', CURRENT_DATE)
    RETURNING id INTO v_chapter_id;
  END IF;

  INSERT INTO public.stride_plans (
    user_id, bucket_id, life_area, strides, suggested_routines, updated_at
  ) VALUES (
    p_user_id, v_bucket_id, v_life_area_name,
    COALESCE(p_stride_plan->'strides', '[]'::jsonb),
    COALESCE(p_stride_plan->'suggestedRoutines', '[]'::jsonb),
    now()
  )
  ON CONFLICT (bucket_id)
  DO UPDATE SET
    life_area = EXCLUDED.life_area,
    strides = EXCLUDED.strides,
    suggested_routines = EXCLUDED.suggested_routines,
    updated_at = now();

  -- 할 일 저장: 새 버킷일 때만. 통합 todos 테이블 사용.
  IF v_bucket_is_new THEN
    -- 반복 없는 할 일 (구 daily_todos) — 오늘 날짜로 스케줄
    INSERT INTO public.todos (
      user_id, bucket_id, title, source, scheduled_date, sort_order
    )
    SELECT
      p_user_id,
      v_bucket_id,
      btrim(item->>'title'),
      CASE
        WHEN (item->>'source') IN ('onboarding', 'ai_generated', 'manual') THEN item->>'source'
        ELSE 'onboarding'
      END,
      CURRENT_DATE,
      GREATEST(ord::integer - 1, 0)
    FROM jsonb_array_elements(p_daily_todos) WITH ORDINALITY AS rows(item, ord)
    WHERE btrim(COALESCE(item->>'title', '')) <> '';

    -- 반복 있는 할 일 (구 routines)
    -- repeatUnit daily → 매일 / weekly → 매주(가입 요일)
    INSERT INTO public.todos (
      user_id, bucket_id, title, source, scheduled_date,
      repeat_type, repeat_weekdays, sort_order
    )
    SELECT
      p_user_id,
      v_bucket_id,
      btrim(item->>'title'),
      CASE
        WHEN (item->>'source') IN ('onboarding', 'ai_generated', 'manual') THEN item->>'source'
        ELSE 'onboarding'
      END,
      CURRENT_DATE,
      CASE WHEN (item->>'repeatUnit') = 'daily' THEN 'daily' ELSE 'weekly' END,
      CASE
        WHEN (item->>'repeatUnit') = 'daily' THEN NULL
        ELSE ARRAY[EXTRACT(DOW FROM CURRENT_DATE)::smallint]
      END,
      GREATEST(ord::integer - 1, 0)
    FROM jsonb_array_elements(p_routines) WITH ORDINALITY AS rows(item, ord)
    WHERE btrim(COALESCE(item->>'title', '')) <> '';
  END IF;

  RETURN v_bucket_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_onboarding_journey(
  uuid, text, integer, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC;
