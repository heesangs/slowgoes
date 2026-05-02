"use server";

import { createClient } from "@/lib/supabase/server";
import { AUTH_ERRORS, BUCKET_ERRORS } from "@/lib/constants";
import type {
  Bucket,
  BucketStatus,
  StrideScope,
  LifeArea,
} from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

const VALID_STRIDE_SCOPES: StrideScope[] = [
  "today",
  "this_week",
  "this_month",
  "this_season",
  "this_year",
  "five_years",
  "decade",
  "someday",
];
const VALID_STATUSES: BucketStatus[] = ["not_started", "in_progress", "completed", "paused"];

interface SaveBucketInput {
  title: string;
  lifeAreaId?: string | null;
  strideScope: StrideScope;
  status: BucketStatus;
}

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error(AUTH_ERRORS.LOGIN_REQUIRED);
  }

  return { supabase, userId: user.id };
}

async function assertLifeAreaOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  lifeAreaId: string | null
) {
  if (!lifeAreaId) return;

  const { data, error } = await supabase
    .from("life_areas")
    .select("id")
    .eq("id", lifeAreaId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(BUCKET_ERRORS.LIFE_AREA_ACCESS_DENIED);
  }
}

async function assertBucketOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bucketId: string
) {
  const { data, error } = await supabase
    .from("buckets")
    .select("id")
    .eq("id", bucketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(BUCKET_ERRORS.ACCESS_DENIED);
  }
}

function validateBucketInput(input: SaveBucketInput) {
  const title = input.title?.trim();
  if (!title) {
    throw new Error(BUCKET_ERRORS.TITLE_REQUIRED);
  }
  if (!VALID_STRIDE_SCOPES.includes(input.strideScope)) {
    throw new Error(BUCKET_ERRORS.STRIDE_SCOPE_INVALID);
  }
  if (!VALID_STATUSES.includes(input.status)) {
    throw new Error(BUCKET_ERRORS.STATUS_INVALID);
  }
  return title;
}

function normalizeLifeAreaId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toClientError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export async function createBucketAction(
  input: SaveBucketInput
): Promise<{ success: boolean; data?: BucketRow; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const title = validateBucketInput(input);
    const lifeAreaId = normalizeLifeAreaId(input.lifeAreaId);

    await assertLifeAreaOwnership(supabase, userId, lifeAreaId);

    const { data, error } = await supabase
      .from("buckets")
      .insert({
        user_id: userId,
        life_area_id: lifeAreaId,
        title,
        stride_scope: input.strideScope,
        status: input.status,
      })
      .select("*, life_area:life_areas(id, name)")
      .single();

    if (error || !data) {
      throw error ?? new Error(BUCKET_ERRORS.CREATE_FAILED);
    }

    return { success: true, data: data as BucketRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, BUCKET_ERRORS.CREATE_ERROR),
    };
  }
}

export async function updateBucketAction(
  bucketId: string,
  input: SaveBucketInput
): Promise<{ success: boolean; data?: BucketRow; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const title = validateBucketInput(input);
    const lifeAreaId = normalizeLifeAreaId(input.lifeAreaId);

    await assertLifeAreaOwnership(supabase, userId, lifeAreaId);

    await assertBucketOwnership(supabase, userId, bucketId);

    const { data, error } = await supabase
      .from("buckets")
      .update({
        title,
        life_area_id: lifeAreaId,
        stride_scope: input.strideScope,
        status: input.status,
      })
      .eq("id", bucketId)
      .eq("user_id", userId)
      .select("*, life_area:life_areas(id, name)")
      .single();

    if (error || !data) {
      throw error ?? new Error(BUCKET_ERRORS.UPDATE_FAILED);
    }

    return { success: true, data: data as BucketRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, BUCKET_ERRORS.UPDATE_ERROR),
    };
  }
}

/**
 * 대시보드의 "버킷리스트 관리" 시트가 열릴 때 lazy 로 호출.
 * /buckets 페이지의 server component 와 동일한 데이터 셰이프 반환.
 */
export async function getBucketManagementDataAction(): Promise<{
  success: boolean;
  data?: {
    buckets: BucketRow[];
    lifeAreas: Pick<LifeArea, "id" | "name">[];
  };
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthContext();

    const [lifeAreasResult, bucketsResult] = await Promise.all([
      supabase
        .from("life_areas")
        .select("id, name")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("buckets")
        .select("*, life_area:life_areas(id, name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (lifeAreasResult.error) throw lifeAreasResult.error;
    if (bucketsResult.error) throw bucketsResult.error;

    return {
      success: true,
      data: {
        lifeAreas:
          (lifeAreasResult.data as Pick<LifeArea, "id" | "name">[] | null) ?? [],
        buckets: (bucketsResult.data as BucketRow[] | null) ?? [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, BUCKET_ERRORS.LIST_ERROR),
    };
  }
}

export async function deleteBucketAction(
  bucketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    // 자식 데이터 처리 (안전망 — DB FK가 이미 처리하더라도 명시적으로 정리)
    // - tasks: 히스토리 보존을 위해 bucket_id만 NULL 처리 (action_logs와 일관)
    // - chapters: FK ON DELETE CASCADE이지만, RLS 격리/명시성을 위해 사전 삭제
    //   (챕터 UI는 제거됐지만 테이블은 데이터 보존 차원에서 유지 중)
    // - daily_todos / routines / action_logs: FK SET NULL로 자동 처리됨
    // - stride_plans: FK CASCADE로 자동 삭제됨
    const { error: tasksError } = await supabase
      .from("tasks")
      .update({ bucket_id: null })
      .eq("bucket_id", bucketId)
      .eq("user_id", userId);

    if (tasksError) {
      throw tasksError;
    }

    const { error: chaptersError } = await supabase
      .from("chapters")
      .delete()
      .eq("bucket_id", bucketId)
      .eq("user_id", userId);

    if (chaptersError) {
      throw chaptersError;
    }

    const { error } = await supabase
      .from("buckets")
      .delete()
      .eq("id", bucketId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, BUCKET_ERRORS.DELETE_ERROR),
    };
  }
}
