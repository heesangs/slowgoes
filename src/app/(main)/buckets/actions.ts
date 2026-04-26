"use server";

import { createClient } from "@/lib/supabase/server";
import { decomposeBucket } from "@/lib/ai/analyze";
import {
  AUTH_ERRORS,
  BUCKET_ERRORS,
  CHAPTER_ERRORS,
} from "@/lib/constants";
import type {
  Bucket,
  BucketDecompositionSuggestion,
  BucketStatus,
  StrideScope,
  Chapter,
  ChapterStatus,
  LifeArea,
  Profile,
} from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

type ChapterRow = Chapter;

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
const VALID_CHAPTER_STATUSES: ChapterStatus[] = ["active", "completed", "paused"];

interface SaveBucketInput {
  title: string;
  lifeAreaId?: string | null;
  strideScope: StrideScope;
  status: BucketStatus;
}

interface SaveChapterInput {
  title: string;
  description?: string | null;
  status: ChapterStatus;
  startDate?: string | null;
  endDate?: string | null;
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

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateDateInput(value: string | null | undefined, fieldLabel: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldLabel} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function validateChapterInput(input: SaveChapterInput) {
  const title = input.title?.trim();
  if (!title) {
    throw new Error(CHAPTER_ERRORS.TITLE_REQUIRED);
  }
  if (!VALID_CHAPTER_STATUSES.includes(input.status)) {
    throw new Error(CHAPTER_ERRORS.STATUS_INVALID);
  }

  const startDate = validateDateInput(input.startDate, "시작일");
  const endDate = validateDateInput(input.endDate, "종료일");

  if (startDate && endDate && startDate > endDate) {
    throw new Error(CHAPTER_ERRORS.DATE_RANGE_INVALID);
  }

  return {
    title,
    description: normalizeOptionalText(input.description),
    startDate,
    endDate,
  };
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

    // 자식 데이터 처리
    // - tasks: 히스토리 보존을 위해 bucket_id만 NULL 처리 (action_logs와 일관)
    // - chapters: 버킷에 강하게 종속되므로 사전 삭제
    //   (FK가 NO ACTION이라 사전 삭제 없으면 외래키 제약 위반으로 버킷 삭제 실패)
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

export async function createChapterAction(
  bucketId: string,
  input: SaveChapterInput
): Promise<{ success: boolean; data?: ChapterRow; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const validated = validateChapterInput(input);

    await assertBucketOwnership(supabase, userId, bucketId);

    const { data, error } = await supabase
      .from("chapters")
      .insert({
        user_id: userId,
        bucket_id: bucketId,
        title: validated.title,
        description: validated.description,
        status: input.status,
        start_date: validated.startDate,
        end_date: validated.endDate,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new Error(CHAPTER_ERRORS.CREATE_FAILED);
    }

    return { success: true, data: data as ChapterRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, CHAPTER_ERRORS.CREATE_ERROR),
    };
  }
}

export async function updateChapterAction(
  bucketId: string,
  chapterId: string,
  input: SaveChapterInput
): Promise<{ success: boolean; data?: ChapterRow; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();
    const validated = validateChapterInput(input);

    await assertBucketOwnership(supabase, userId, bucketId);

    const { data: ownedChapter, error: chapterOwnershipError } = await supabase
      .from("chapters")
      .select("id")
      .eq("id", chapterId)
      .eq("bucket_id", bucketId)
      .eq("user_id", userId)
      .maybeSingle();

    if (chapterOwnershipError || !ownedChapter) {
      throw new Error(CHAPTER_ERRORS.ACCESS_DENIED);
    }

    const { data, error } = await supabase
      .from("chapters")
      .update({
        title: validated.title,
        description: validated.description,
        status: input.status,
        start_date: validated.startDate,
        end_date: validated.endDate,
      })
      .eq("id", chapterId)
      .eq("bucket_id", bucketId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new Error(CHAPTER_ERRORS.UPDATE_FAILED);
    }

    return { success: true, data: data as ChapterRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, CHAPTER_ERRORS.UPDATE_ERROR),
    };
  }
}

export async function deleteChapterAction(
  bucketId: string,
  chapterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    await assertBucketOwnership(supabase, userId, bucketId);

    const { error } = await supabase
      .from("chapters")
      .delete()
      .eq("id", chapterId)
      .eq("bucket_id", bucketId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, CHAPTER_ERRORS.DELETE_ERROR),
    };
  }
}

export async function decomposeBucketAction(
  bucketId: string
): Promise<{ success: boolean; data?: BucketDecompositionSuggestion[]; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

    const [bucketResult, profileResult, chaptersResult] = await Promise.all([
      supabase
        .from("buckets")
        .select("id, title, stride_scope")
        .eq("id", bucketId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("chapters")
        .select("title")
        .eq("bucket_id", bucketId)
        .eq("user_id", userId),
    ]);

    if (bucketResult.error || !bucketResult.data) {
      throw new Error(BUCKET_ERRORS.ACCESS_DENIED);
    }

    const suggestions = await decomposeBucket({
      bucketTitle: bucketResult.data.title as string,
      strideScope: bucketResult.data.stride_scope as StrideScope,
      profile: (profileResult.data as Profile | null) ?? null,
      existingChapterTitles:
        (chaptersResult.data as Array<{ title: string }> | null)?.map((chapter) => chapter.title) ?? [],
    });

    return {
      success: true,
      data: suggestions,
    };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, BUCKET_ERRORS.DECOMPOSE_ERROR),
    };
  }
}
