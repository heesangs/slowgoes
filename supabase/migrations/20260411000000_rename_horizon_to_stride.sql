-- horizon → stride("나의 보폭") 리팩토링 + MBTI 16값 확장
-- 1) buckets.horizon → buckets.stride_scope (8개 값 CHECK 확장)
-- 2) horizon_analyses → stride_plans (테이블명 + horizons 컬럼 → strides)
-- 3) 인덱스 리네임
-- 4) RLS 정책 재생성
-- 5) profiles.personality_type CHECK 제약 16값으로 확장 (레거시 IT/IF/ET/EF 데이터 NULL 처리)
-- 6) save_onboarding_journey RPC 재정의 (stride_scope + 16값 MBTI)

-- =========================
-- 1) buckets.horizon → stride_scope
-- =========================
ALTER TABLE public.buckets DROP CONSTRAINT IF EXISTS buckets_horizon_check;

ALTER TABLE public.buckets RENAME COLUMN horizon TO stride_scope;

ALTER TABLE public.buckets ALTER COLUMN stride_scope SET DEFAULT 'someday';

ALTER TABLE public.buckets ADD CONSTRAINT buckets_stride_scope_check
  CHECK (stride_scope IN (
    'today','this_week','this_month','this_season',
    'this_year','five_years','decade','someday'
  ));

-- =========================
-- 2) horizon_analyses → stride_plans
-- =========================
ALTER TABLE public.horizon_analyses RENAME TO stride_plans;
ALTER TABLE public.stride_plans RENAME COLUMN horizons TO strides;

-- 인덱스 리네임
ALTER INDEX IF EXISTS idx_horizon_analyses_user_bucket
  RENAME TO idx_stride_plans_user_bucket;

-- =========================
-- 3) RLS 정책 재생성
-- =========================
DROP POLICY IF EXISTS "horizon_analyses_select_own" ON public.stride_plans;
DROP POLICY IF EXISTS "horizon_analyses_insert_own" ON public.stride_plans;
DROP POLICY IF EXISTS "horizon_analyses_update_own" ON public.stride_plans;
DROP POLICY IF EXISTS "horizon_analyses_delete_own" ON public.stride_plans;

CREATE POLICY "stride_plans_select_own" ON public.stride_plans
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "stride_plans_insert_own" ON public.stride_plans
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "stride_plans_update_own" ON public.stride_plans
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "stride_plans_delete_own" ON public.stride_plans
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- =========================
-- 4) profiles.personality_type 16값 확장
-- =========================
-- 레거시 값(IT/IF/ET/EF)은 새 16값 집합에 없으므로 NULL 처리
UPDATE public.profiles
SET personality_type = NULL
WHERE personality_type IN ('IT', 'IF', 'ET', 'EF');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_personality_type_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_personality_type_check
  CHECK (personality_type IS NULL OR personality_type IN (
    'ISTJ','ISFJ','INFJ','INTJ',
    'ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP',
    'ESTJ','ESFJ','ENFJ','ENTJ'
  ));

-- =========================
-- 5) save_onboarding_journey RPC 재정의
-- =========================
DROP FUNCTION IF EXISTS public.save_onboarding_journey(
  uuid,
  text,
  text,
  text[],
  text,
  text[],
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
);

CREATE OR REPLACE FUNCTION public.save_onboarding_journey(
  p_user_id uuid,
  p_display_name text,
  p_self_level text,
  p_user_context text[] DEFAULT ARRAY[]::text[],
  p_grade text DEFAULT NULL,
  p_subjects text[] DEFAULT ARRAY[]::text[],
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
  v_chapter_id uuid;
  v_subjects text[];
  v_user_context text[];
  v_scene_text text;
  v_life_area_name text;
  v_chapter_title text;
  v_week_start date := date_trunc('week', CURRENT_DATE)::date;
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
  v_subjects := COALESCE(p_subjects, ARRAY[]::text[]);
  v_user_context := COALESCE(p_user_context, ARRAY[]::text[]);

  IF btrim(COALESCE(p_display_name, '')) = '' THEN
    RAISE EXCEPTION '닉네임을 입력해주세요.';
  END IF;
  IF p_self_level IS NULL OR p_self_level NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION '속도 값이 올바르지 않습니다.';
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

  INSERT INTO public.profiles (
    id,
    display_name,
    grade,
    subjects,
    self_level,
    user_context,
    life_clock_age,
    gender,
    personality_type,
    pace_type,
    onboarding_version
  )
  VALUES (
    p_user_id,
    btrim(p_display_name),
    NULLIF(btrim(COALESCE(p_grade, '')), ''),
    v_subjects,
    p_self_level,
    v_user_context,
    p_life_clock_age,
    p_gender,
    p_personality_type,
    p_pace_type,
    2
  )
  ON CONFLICT (id)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    grade = EXCLUDED.grade,
    subjects = EXCLUDED.subjects,
    self_level = EXCLUDED.self_level,
    user_context = EXCLUDED.user_context,
    life_clock_age = EXCLUDED.life_clock_age,
    gender = EXCLUDED.gender,
    personality_type = EXCLUDED.personality_type,
    pace_type = EXCLUDED.pace_type,
    onboarding_version = 2;

  SELECT id
  INTO v_life_area_id
  FROM public.life_areas
  WHERE user_id = p_user_id
    AND name = v_life_area_name
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_life_area_id IS NULL THEN
    INSERT INTO public.life_areas (user_id, name, sort_order)
    VALUES (p_user_id, v_life_area_name, 0)
    RETURNING id INTO v_life_area_id;
  END IF;

  INSERT INTO public.buckets (
    user_id,
    life_area_id,
    title,
    stride_scope,
    status
  ) VALUES (
    p_user_id,
    v_life_area_id,
    v_scene_text,
    p_bucket_stride_scope,
    'in_progress'
  )
  RETURNING id INTO v_bucket_id;

  IF v_chapter_title = '' THEN
    v_chapter_title := v_scene_text || ' 이번 시즌 실행';
  END IF;

  INSERT INTO public.chapters (
    user_id,
    bucket_id,
    title,
    status,
    start_date
  ) VALUES (
    p_user_id,
    v_bucket_id,
    v_chapter_title,
    'active',
    CURRENT_DATE
  )
  RETURNING id INTO v_chapter_id;

  INSERT INTO public.stride_plans (
    user_id,
    bucket_id,
    life_area,
    empathy_message,
    strides,
    suggested_routines,
    updated_at
  ) VALUES (
    p_user_id,
    v_bucket_id,
    v_life_area_name,
    COALESCE(NULLIF(btrim(p_stride_plan->>'empathyMessage'), ''), ''),
    COALESCE(p_stride_plan->'strides', '[]'::jsonb),
    COALESCE(p_stride_plan->'suggestedRoutines', '[]'::jsonb),
    now()
  )
  ON CONFLICT (bucket_id)
  DO UPDATE SET
    life_area = EXCLUDED.life_area,
    empathy_message = EXCLUDED.empathy_message,
    strides = EXCLUDED.strides,
    suggested_routines = EXCLUDED.suggested_routines,
    updated_at = now();

  INSERT INTO public.daily_todos (
    user_id,
    bucket_id,
    title,
    status,
    source,
    week_start,
    sort_order
  )
  SELECT
    p_user_id,
    v_bucket_id,
    btrim(item->>'title'),
    'pending',
    CASE
      WHEN (item->>'source') IN ('onboarding', 'ai_generated', 'manual') THEN item->>'source'
      ELSE 'onboarding'
    END,
    v_week_start,
    GREATEST(ord::integer - 1, 0)
  FROM jsonb_array_elements(p_daily_todos) WITH ORDINALITY AS rows(item, ord)
  WHERE btrim(COALESCE(item->>'title', '')) <> '';

  INSERT INTO public.routines (
    user_id,
    bucket_id,
    title,
    source,
    repeat_unit,
    repeat_value,
    is_active,
    sort_order
  )
  SELECT
    p_user_id,
    v_bucket_id,
    btrim(item->>'title'),
    CASE
      WHEN (item->>'source') IN ('onboarding', 'ai_generated', 'manual') THEN item->>'source'
      ELSE 'onboarding'
    END,
    CASE
      WHEN (item->>'repeatUnit') IN ('daily', 'weekly') THEN item->>'repeatUnit'
      ELSE 'weekly'
    END,
    GREATEST(1, LEAST(31, COALESCE((item->>'repeatValue')::integer, 1))),
    true,
    GREATEST(ord::integer - 1, 0)
  FROM jsonb_array_elements(p_routines) WITH ORDINALITY AS rows(item, ord)
  WHERE btrim(COALESCE(item->>'title', '')) <> '';

  RETURN v_bucket_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_onboarding_journey(
  uuid,
  text,
  text,
  text[],
  text,
  text[],
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_onboarding_journey(
  uuid,
  text,
  text,
  text[],
  text,
  text[],
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) TO authenticated;
