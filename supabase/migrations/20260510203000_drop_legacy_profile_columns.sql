-- profiles 레거시 컬럼 정리 + save_onboarding_journey RPC 시그니처 단순화
-- 대상 제거 컬럼: grade, subjects, self_level, user_context

-- 기존(레거시 인자 포함) 함수 제거
DROP FUNCTION IF EXISTS public.save_onboarding_journey(
  uuid, text, text, text[], text, text[], integer, text, text, text, text,
  text, text, text, jsonb, jsonb, jsonb
);

-- 재실행 안정성: 신규 시그니처가 이미 있으면 먼저 제거
DROP FUNCTION IF EXISTS public.save_onboarding_journey(
  uuid, text, integer, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
);

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
    id,
    display_name,
    life_clock_age,
    gender,
    personality_type,
    pace_type,
    onboarding_version
  )
  VALUES (
    p_user_id,
    btrim(p_display_name),
    p_life_clock_age,
    p_gender,
    p_personality_type,
    p_pace_type,
    2
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

  -- 버킷 멱등 처리: 동일 (user_id, life_area_id, title) 활성 버킷 존재 시 재사용
  -- "활성"의 정의: status NOT IN ('completed', 'paused')
  SELECT id
  INTO v_bucket_id
  FROM public.buckets
  WHERE user_id = p_user_id
    AND life_area_id = v_life_area_id
    AND title = v_scene_text
    AND status NOT IN ('completed', 'paused')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_bucket_id IS NULL THEN
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

    v_bucket_is_new := true;
  END IF;

  IF v_chapter_title = '' THEN
    v_chapter_title := v_scene_text || ' 이번 시즌 실행';
  END IF;

  -- 챕터: 새 버킷일 때만 INSERT (재사용 시 기존 챕터 유지)
  IF v_bucket_is_new THEN
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
  END IF;

  -- stride_plans: 기존 ON CONFLICT (bucket_id) DO UPDATE — 멱등
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

  -- 데일리 투두/루틴: 새 버킷일 때만 INSERT
  IF v_bucket_is_new THEN
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
  END IF;

  RETURN v_bucket_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_onboarding_journey(
  uuid, text, integer, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_onboarding_journey(
  uuid, text, integer, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
) TO authenticated;

-- 레거시 profiles 컬럼 제거
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS grade,
  DROP COLUMN IF EXISTS subjects,
  DROP COLUMN IF EXISTS self_level,
  DROP COLUMN IF EXISTS user_context;
