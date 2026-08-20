-- MBTI 2축 허용 (20260821)
--
-- 온보딩 Step 1의 MBTI 입력을 4축(I/E·S/N·T/F·J/P)에서 **2축(I/E, T/F)** 으로 줄인다.
-- 나머지 두 축은 마지막 단계에서 선택 입력이라, 완성되지 않은 2글자 상태로 저장되는 것이
-- 정상 경로가 된다. 안 고른 축을 임의 기본값으로 채워 AI에 사실처럼 넘기지 않기 위함이다.
--
-- 흥미롭게도 최초 스키마(20260308193000)의 CHECK가 정확히 이 2축(IT/IF/ET/EF)이었고,
-- 20260411000000에서 16종으로 확장하며 기존 2축 데이터를 NULL로 밀었다. 되돌리는 셈이다.
--
-- 기존 16종 데이터는 그대로 유효하다 — 허용 집합을 넓히기만 한다.

-- 1) profiles.personality_type CHECK 확장 (16 → 20값)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_personality_type_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_personality_type_check
  CHECK (personality_type IS NULL OR personality_type IN (
    'IT','IF','ET','EF',
    'ISTJ','ISFJ','INFJ','INTJ',
    'ISTP','ISFP','INFP','INTP',
    'ESTP','ESFP','ENFP','ENTP',
    'ESTJ','ESFJ','ENFJ','ENTJ'
  ));

COMMENT ON COLUMN public.profiles.personality_type IS
  'MBTI. 2글자(IT/IF/ET/EF)=I/E·T/F 두 축만 응답, 4글자=전체 응답. 온보딩 Step 1은 2축만 묻는다';

-- 2) save_onboarding_journey 재정의 — 시그니처 동일, 성향 허용 집합만 확장
--    (본문은 20260718000000_unify_todos.sql 그대로. 성향 검증 IN 절만 20값으로)
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
  -- 2축(IT/IF/ET/EF) 또는 4축(16종) 모두 허용.
  -- 온보딩 Step 1이 I/E·T/F 두 축만 묻고, 나머지 두 축은 마지막 단계에서 **선택** 입력이라
  -- 완성되지 않은 채로 저장되는 것이 정상 경로다.
  IF p_personality_type IS NULL OR p_personality_type NOT IN (
    'IT','IF','ET','EF',
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
