"use server";

import { createClient } from "@/lib/supabase/server";
import { decomposeBucket } from "@/lib/ai/analyze";
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
    throw new Error("로그인이 필요합니다.");
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
    throw new Error("선택한 삶의 영역에 접근할 수 없습니다.");
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
    throw new Error("해당 버킷에 접근할 수 없습니다.");
  }
}

function validateBucketInput(input: SaveBucketInput) {
  const title = input.title?.trim();
  if (!title) {
    throw new Error("버킷 제목을 입력해주세요.");
  }
  if (!VALID_STRIDE_SCOPES.includes(input.strideScope)) {
    throw new Error("나의 보폭 값이 올바르지 않습니다.");
  }
  if (!VALID_STATUSES.includes(input.status)) {
    throw new Error("상태 값이 올바르지 않습니다.");
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
    throw new Error("챕터 제목을 입력해주세요.");
  }
  if (!VALID_CHAPTER_STATUSES.includes(input.status)) {
    throw new Error("챕터 상태 값이 올바르지 않습니다.");
  }

  const startDate = validateDateInput(input.startDate, "시작일");
  const endDate = validateDateInput(input.endDate, "종료일");

  if (startDate && endDate && startDate > endDate) {
    throw new Error("시작일은 종료일보다 늦을 수 없습니다.");
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
      throw error ?? new Error("버킷 생성에 실패했습니다.");
    }

    return { success: true, data: data as BucketRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, "버킷 생성 중 오류가 발생했습니다."),
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
      throw error ?? new Error("버킷 수정에 실패했습니다.");
    }

    return { success: true, data: data as BucketRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, "버킷 수정 중 오류가 발생했습니다."),
    };
  }
}

export async function deleteBucketAction(
  bucketId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthContext();

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
      error: toClientError(error, "버킷 삭제 중 오류가 발생했습니다."),
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
      throw error ?? new Error("챕터 생성에 실패했습니다.");
    }

    return { success: true, data: data as ChapterRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, "챕터 생성 중 오류가 발생했습니다."),
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
      throw new Error("해당 챕터에 접근할 수 없습니다.");
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
      throw error ?? new Error("챕터 수정에 실패했습니다.");
    }

    return { success: true, data: data as ChapterRow };
  } catch (error) {
    return {
      success: false,
      error: toClientError(error, "챕터 수정 중 오류가 발생했습니다."),
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
      error: toClientError(error, "챕터 삭제 중 오류가 발생했습니다."),
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
      throw new Error("해당 버킷에 접근할 수 없습니다.");
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
      error: toClientError(error, "버킷 분해 중 오류가 발생했습니다."),
    };
  }
}
