-- 버킷 중복 생성 안전망 (1/2): FK 규칙 정비 + save_onboarding_journey 멱등화
-- 배경:
--   대시보드 "새로운 장면 탐색" 시트에서 확정 후 시트가 닫히지 않아
--   유저가 재클릭 → 동일 (user_id, life_area_id, title) 버킷이 중복 생성되던 버그.
--   클라이언트 분기 + 이 마이그레이션의 RPC 멱등화로 근본 원인 차단.
--
-- 본 파일 변경 사항:
--   1) chapters.bucket_id FK: NO ACTION → CASCADE
--      (챕터는 버킷에 강하게 종속, 버킷 삭제 시 함께 정리되는 것이 자연스러움)
--   2) tasks.bucket_id FK: NO ACTION → SET NULL
--      (태스크는 히스토리 보존 목적, action_logs 와 동일한 정책)
--   3) save_onboarding_journey RPC 멱등화:
--      동일 (user_id, life_area_id, title) 활성 버킷이 이미 있으면 재사용하고
--      자식 데이터(chapters/daily_todos/routines)는 재INSERT 하지 않음.
--      stride_plans 는 기존 ON CONFLICT (bucket_id) DO UPDATE 유지.
--
-- 후속 마이그레이션 (별도 파일):
--   buckets (user_id, life_area_id, title) WHERE status NOT IN ('completed','paused')
--   partial unique index — 기존 중복 데이터 정리 후 적용.

-- =========================
-- 1) chapters.bucket_id FK → CASCADE
-- =========================
ALTER TABLE public.chapters
  DROP CONSTRAINT IF EXISTS chapters_bucket_id_fkey;

ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_bucket_id_fkey
  FOREIGN KEY (bucket_id)
  REFERENCES public.buckets(id)
  ON DELETE CASCADE;

-- =========================
-- 2) tasks.bucket_id FK → SET NULL
-- =========================
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_bucket_id_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_bucket_id_fkey
  FOREIGN KEY (bucket_id)
  REFERENCES public.buckets(id)
  ON DELETE SET NULL;

-- =========================
-- 3) save_onboarding_journey RPC 멱등화
-- =========================
DROP FUNCTION IF EXISTS public.save_onboarding_journey(
  uuid, text, text, text[], text, text[], integer, text, text, text, text,
  text, text, text, jsonb, jsonb, jsonb
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
  v_bucket_is_new boolean := false;
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

  -- 프로필 upsert
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
  -- (재사용은 중복 제출 케이스 → 같은 todos/routines 들어옴 → 다시 만들 필요 없음.
  --  추가 작업이 필요한 경우는 addItemsToExistingBucketAction을 사용해야 함)
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
  uuid, text, text, text[], text, text[], integer, text, text, text, text,
  text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_onboarding_journey(
  uuid, text, text, text[], text, text[], integer, text, text, text, text,
  text, text, text, jsonb, jsonb, jsonb
) TO authenticated;
