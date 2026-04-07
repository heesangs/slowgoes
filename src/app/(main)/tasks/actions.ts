"use server";

// 과제 관련 서버 액션 — 인증 확인 후 AI 분석 및 DB 저장

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  adjustPacePlan,
  analyzeLifeScene,
  analyzeTask,
  decomposeSubtask,
  generateFirstStep,
} from "@/lib/ai/analyze";
import type {
  AISubtaskSuggestion,
  Difficulty,
  EditableSubtask,
  FirstStepPlanResult,
  Gender,
  LifeSceneAnalysisResult,
  MemoTemplate,
  PaceAdjustOption,
  PersonalityType,
  Profile,
  TaskInputData,
} from "@/types";

interface DifficultyLearningProfile {
  tendency: "easier" | "harder" | "neutral";
  averageTimeMultiplier: number | null;
  sampleSize: number;
  note: string;
}

interface DifficultyAdjustmentRow {
  ai_difficulty: Difficulty;
  final_difficulty: Difficulty;
  ai_estimated_minutes: number;
  final_estimated_minutes: number;
}

// 인증된 사용자 ID 반환 (미인증 시 에러)
async function getAuthUserId() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: user.id };
}

// 프로필 조회
async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data as Profile | null;
}

// 현재 사용자가 해당 과제에 접근 가능한지 확인
async function assertTaskOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("해당 과제에 접근할 수 없습니다.");
  }
}

async function assertBucketOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucketId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("buckets")
    .select("id")
    .eq("id", bucketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("선택한 삶의 장면에 접근할 수 없습니다.");
  }
}

async function getOwnedChapter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chapterId: string,
  userId: string
): Promise<{ id: string; bucket_id: string | null }> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, bucket_id")
    .eq("id", chapterId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("선택한 챕터에 접근할 수 없습니다.");
  }

  return { id: data.id as string, bucket_id: (data.bucket_id as string | null) ?? null };
}

function normalizeOptionalId(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function difficultyRank(value: Difficulty) {
  if (value === "easy") return 0;
  if (value === "medium") return 1;
  return 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function getDifficultyLearningProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<DifficultyLearningProfile | null> {
  const { data, error } = await supabase
    .from("difficulty_adjustments")
    .select("ai_difficulty, final_difficulty, ai_estimated_minutes, final_estimated_minutes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error || !data || data.length < 3) {
    return null;
  }

  const rows = data as DifficultyAdjustmentRow[];
  let totalDifficultyDelta = 0;
  let ratioSum = 0;
  let ratioCount = 0;

  for (const row of rows) {
    totalDifficultyDelta += difficultyRank(row.final_difficulty) - difficultyRank(row.ai_difficulty);
    if (row.ai_estimated_minutes > 0 && row.final_estimated_minutes > 0) {
      ratioSum += row.final_estimated_minutes / row.ai_estimated_minutes;
      ratioCount += 1;
    }
  }

  const avgDelta = totalDifficultyDelta / rows.length;
  const tendency: DifficultyLearningProfile["tendency"] =
    avgDelta <= -0.25 ? "easier" : avgDelta >= 0.25 ? "harder" : "neutral";

  const averageTimeMultiplier =
    ratioCount > 0 ? clamp(ratioSum / ratioCount, 0.7, 1.4) : null;

  const note =
    tendency === "easier"
      ? "사용자가 난이도를 낮추는 편이므로 진입 장벽이 낮은 단계를 우선 제안"
      : tendency === "harder"
        ? "사용자가 난이도를 높이는 편이므로 도전적인 단계를 일부 포함"
        : "난이도 조정 경향은 크지 않아 기본 균형을 유지";

  return {
    tendency,
    averageTimeMultiplier,
    sampleSize: rows.length,
    note,
  };
}

// 서버 에러를 사용자 메시지로 안전하게 변환
function toClientErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message?.trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();
  if (
    lower.includes("googlegenerativeai") ||
    lower.includes("generativelanguage.googleapis.com")
  ) {
    return "AI 서비스 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  // 지나치게 긴 원문 에러는 노출하지 않음
  if (message.length > 180) {
    return fallback;
  }

  return message;
}

/**
 * 과제 삭제 — 소유권 확인 후 tasks 삭제 (subtasks는 CASCADE로 자동 삭제)
 */
export async function deleteTaskAction(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthUserId();
    await assertTaskOwnership(supabase, taskId, userId);

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId);

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 과제 분석 — AI가 하위 과제로 분해
 */
export async function analyzeTaskAction(data: TaskInputData): Promise<{
  success: boolean;
  data?: AISubtaskSuggestion[];
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthUserId();
    const profile = await getProfile(supabase, userId);
    const learningProfile = await getDifficultyLearningProfile(supabase, userId);
    const suggestions = await analyzeTask(data.title, profile, {
      memo: data.memo,
      desiredSubtaskCount: data.desiredSubtaskCount,
      targetDurationMinutes: data.targetDurationMinutes,
      dueDate: data.dueDate,
      difficultyLearning: learningProfile,
    });
    return { success: true, data: suggestions };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "분석 중 오류가 발생했습니다."),
    };
  }
}

/**
 * 삶의 장면 분석 — 영역 분류 + 시간 지평(온보딩 Step 3)
 */
export async function analyzeLifeSceneAction(data: {
  sceneText: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
}): Promise<{
  success: boolean;
  data?: LifeSceneAnalysisResult;
  error?: string;
}> {
  try {
    await getAuthUserId();

    const sceneText = data.sceneText?.trim();
    if (!sceneText) {
      throw new Error("삶의 장면을 입력해주세요.");
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error("나이 값이 올바르지 않습니다.");
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error("성별 값이 올바르지 않습니다.");
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error("성향 값이 올바르지 않습니다.");
    }

    const analysis = await analyzeLifeScene({
      sceneText,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
    });

    return { success: true, data: analysis };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "삶의 장면 분석 중 오류가 발생했습니다."),
    };
  }
}

/**
 * 첫 실행안 생성 — 이번 주 행동을 세부 단계로 구체화 (온보딩 Step 4)
 */
export async function generateFirstStepAction(data: {
  weeklyAction: string;
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
}): Promise<{
  success: boolean;
  data?: FirstStepPlanResult;
  error?: string;
}> {
  try {
    await getAuthUserId();

    const weeklyAction = data.weeklyAction?.trim();
    const sceneText = data.sceneText?.trim();
    const lifeArea = data.lifeArea?.trim();

    if (!weeklyAction) {
      throw new Error("이번 주 행동을 선택해주세요.");
    }
    if (!sceneText) {
      throw new Error("삶의 장면이 비어 있습니다.");
    }
    if (!lifeArea) {
      throw new Error("삶의 영역 정보가 비어 있습니다.");
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error("나이 값이 올바르지 않습니다.");
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error("성별 값이 올바르지 않습니다.");
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error("성향 값이 올바르지 않습니다.");
    }

    const plan = await generateFirstStep({
      weeklyAction,
      sceneText,
      lifeArea,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
    });

    return { success: true, data: plan };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "첫 실행안 생성 중 오류가 발생했습니다."),
    };
  }
}

/**
 * 페이스 조정 — "더 구체적으로" 옵션만 AI 재호출
 */
export async function adjustPaceAction(data: {
  option: PaceAdjustOption;
  weeklyAction: string;
  sceneText: string;
  lifeArea: string;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
  currentPlan: FirstStepPlanResult;
}): Promise<{
  success: boolean;
  data?: FirstStepPlanResult;
  error?: string;
}> {
  try {
    await getAuthUserId();

    const option = data.option;
    const weeklyAction = data.weeklyAction?.trim();
    const sceneText = data.sceneText?.trim();
    const lifeArea = data.lifeArea?.trim();

    if (!["lighter", "more_specific", "once_per_week", "start_this_week", "start_today"].includes(option)) {
      throw new Error("페이스 옵션 값이 올바르지 않습니다.");
    }
    if (!weeklyAction) {
      throw new Error("이번 주 행동을 선택해주세요.");
    }
    if (!sceneText) {
      throw new Error("삶의 장면이 비어 있습니다.");
    }
    if (!lifeArea) {
      throw new Error("삶의 영역 정보가 비어 있습니다.");
    }
    if (!Number.isFinite(data.age) || data.age < 0 || data.age > 100) {
      throw new Error("나이 값이 올바르지 않습니다.");
    }
    if (!["male", "female"].includes(data.gender)) {
      throw new Error("성별 값이 올바르지 않습니다.");
    }
    if (!["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"].includes(data.personalityType)) {
      throw new Error("성향 값이 올바르지 않습니다.");
    }
    if (!data.currentPlan || !Array.isArray(data.currentPlan.subtasks)) {
      throw new Error("현재 실행안 정보가 올바르지 않습니다.");
    }

    // 프론트엔드 우선 처리 정책: 더 구체적으로만 AI 재호출
    if (option !== "more_specific") {
      return { success: true, data: data.currentPlan };
    }

    const adjustedPlan = await adjustPacePlan({
      option,
      weeklyAction,
      sceneText,
      lifeArea,
      age: data.age,
      gender: data.gender,
      personalityType: data.personalityType,
      currentPlan: data.currentPlan,
    });

    return { success: true, data: adjustedPlan };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "페이스 조정 중 오류가 발생했습니다."),
    };
  }
}

/**
 * 하위 과제 추가 분해 — AI가 더 작은 단계로 분해
 */
export async function decomposeSubtaskAction(
  parentTitle: string,
  taskTitle: string
): Promise<{
  success: boolean;
  data?: AISubtaskSuggestion[];
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthUserId();
    const profile = await getProfile(supabase, userId);
    const learningProfile = await getDifficultyLearningProfile(supabase, userId);
    const suggestions = await decomposeSubtask(parentTitle, taskTitle, profile, learningProfile);
    return { success: true, data: suggestions };
  } catch (error) {
    return {
      success: false,
      error: toClientErrorMessage(error, "분해 중 오류가 발생했습니다."),
    };
  }
}

/**
 * 하위 과제 상태 토글 — completed ↔ pending
 * 모든 하위 과제가 완료되면 상위 과제도 completed 처리
 */
export async function toggleSubtaskAction(
  subtaskId: string,
  taskId: string,
  newStatus: "pending" | "completed"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthUserId();
    await assertTaskOwnership(supabase, taskId, userId);

    const now = new Date().toISOString();
    const { data: updatedSubtask, error: updateError } = await supabase
      .from("subtasks")
      .update({
        status: newStatus,
        completed_at: newStatus === "completed" ? now : null,
      })
      .eq("id", subtaskId)
      .eq("task_id", taskId)
      .select("id")
      .single();

    if (updateError || !updatedSubtask) {
      throw new Error(updateError?.message ?? "하위 과제 상태를 찾을 수 없습니다.");
    }

    // 모든 하위 과제 상태 확인 → 전부 완료면 과제도 completed
    const { data: subtasks, error: subtasksError } = await supabase
      .from("subtasks")
      .select("status")
      .eq("task_id", taskId);

    if (subtasksError || !subtasks) {
      throw new Error(subtasksError?.message ?? "하위 과제 조회에 실패했습니다.");
    }

    const allCompleted =
      subtasks.length > 0 && subtasks.every((s) => s.status === "completed");
    const anyInProgress = subtasks.some(
      (s) => s.status === "in_progress" || s.status === "completed"
    );

    let taskStatus: "pending" | "in_progress" | "completed" = "pending";
    if (allCompleted) taskStatus = "completed";
    else if (anyInProgress) taskStatus = "in_progress";

    const { error: taskUpdateError } = await supabase
      .from("tasks")
      .update({
        status: taskStatus,
        completed_at: allCompleted ? now : null,
      })
      .eq("id", taskId);

    if (taskUpdateError) throw new Error(taskUpdateError.message);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "상태 변경 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 하위 과제 실제 소요 시간 업데이트
 */
export async function updateActualMinutesAction(
  subtaskId: string,
  taskId: string,
  actualMinutes: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthUserId();
    await assertTaskOwnership(supabase, taskId, userId);

    if (!Number.isFinite(actualMinutes) || actualMinutes < 0) {
      throw new Error("실제 소요 시간 값이 올바르지 않습니다.");
    }

    const normalizedMinutes = Math.round(actualMinutes);

    const { data: updatedSubtask, error: updateError } = await supabase
      .from("subtasks")
      .update({ actual_minutes: normalizedMinutes })
      .eq("id", subtaskId)
      .eq("task_id", taskId)
      .select("id")
      .single();

    if (updateError || !updatedSubtask) {
      throw new Error(updateError?.message ?? "하위 과제를 찾을 수 없습니다.");
    }

    // 과제의 total_actual_minutes 업데이트 — leaf 노드만 합산
    const { data: allSubtasks, error: subtasksError } = await supabase
      .from("subtasks")
      .select("id, parent_subtask_id, actual_minutes")
      .eq("task_id", taskId);

    if (subtasksError || !allSubtasks) {
      throw new Error(subtasksError?.message ?? "하위 과제 조회에 실패했습니다.");
    }

    const parentIds = new Set(
      allSubtasks
        .filter((s) => s.parent_subtask_id)
        .map((s) => s.parent_subtask_id)
    );
    const leafTotal = allSubtasks
      .filter((s) => !parentIds.has(s.id))
      .reduce((sum, s) => sum + (s.actual_minutes ?? 0), 0);

    const { error: taskUpdateError } = await supabase
      .from("tasks")
      .update({ total_actual_minutes: leafTotal || null })
      .eq("id", taskId);

    if (taskUpdateError) throw new Error(taskUpdateError.message);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "시간 업데이트 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 과제 저장 — RPC로 tasks + subtasks를 단일 트랜잭션으로 INSERT
 * 어느 한쪽이라도 실패하면 전체 롤백됨
 */
export async function saveTaskAction(data: {
  title: string;
  subtasks: EditableSubtask[];
  memo?: string;
  desiredSubtaskCount?: number;
  targetDurationMinutes?: number;
  dueDate?: string;
  bucketId?: string;
  chapterId?: string;
}): Promise<{
  success: boolean;
  taskId?: string;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthUserId();

    let normalizedBucketId = normalizeOptionalId(data.bucketId);
    const normalizedChapterId = normalizeOptionalId(data.chapterId);

    let ownedChapter: { id: string; bucket_id: string | null } | null = null;
    if (normalizedChapterId) {
      ownedChapter = await getOwnedChapter(supabase, normalizedChapterId, userId);
      if (!normalizedBucketId && ownedChapter.bucket_id) {
        normalizedBucketId = ownedChapter.bucket_id;
      }
    }

    if (normalizedBucketId) {
      await assertBucketOwnership(supabase, normalizedBucketId, userId);
    }

    if (ownedChapter?.bucket_id && normalizedBucketId && ownedChapter.bucket_id !== normalizedBucketId) {
      throw new Error("선택한 챕터는 선택한 삶의 장면에 속하지 않습니다.");
    }

    // 총 예상 시간 계산 — leaf 노드(자식이 없는 노드)만 합산
    const totalMinutes = data.subtasks
      .filter((s) => !data.subtasks.some((c) => c.parent_temp_id === s.temp_id))
      .reduce((sum, s) => sum + s.estimated_minutes, 0);

    const taskId = crypto.randomUUID();

    // subtask 행을 RPC용 jsonb 배열로 변환
    const subtaskRows = data.subtasks.map((s) => ({
      id: s.temp_id,
      parent_subtask_id: s.parent_temp_id,
      depth: s.depth,
      title: s.title,
      difficulty: s.difficulty,
      ai_suggested_difficulty: s.ai_suggested_difficulty,
      estimated_minutes: s.estimated_minutes,
      ai_suggested_minutes: s.ai_suggested_minutes,
      sort_order: s.sort_order,
    }));

    const adjustmentRows = data.subtasks
      .filter((subtask) => {
        const difficultyChanged = subtask.difficulty !== subtask.ai_suggested_difficulty;
        const minutesChanged = Math.abs(subtask.estimated_minutes - subtask.ai_suggested_minutes) >= 5;
        return difficultyChanged || minutesChanged;
      })
      .map((subtask) => ({
        user_id: userId,
        task_id: taskId,
        subtask_id: subtask.temp_id,
        source: "task_create" as const,
        ai_difficulty: subtask.ai_suggested_difficulty,
        final_difficulty: subtask.difficulty,
        ai_estimated_minutes: subtask.ai_suggested_minutes,
        final_estimated_minutes: subtask.estimated_minutes,
      }));

    const { error } = await supabase.rpc("save_task_with_subtasks", {
      p_task_id: taskId,
      p_user_id: userId,
      p_title: data.title,
      p_total_estimated_minutes: totalMinutes,
      p_subtasks: subtaskRows,
      p_memo: data.memo ?? null,
      p_desired_subtask_count: data.desiredSubtaskCount ?? null,
      p_target_duration_minutes: data.targetDurationMinutes ?? null,
      p_due_date: data.dueDate ?? null,
    });

    if (error) throw new Error(`과제 저장 실패: ${error.message}`);

    if (normalizedBucketId || normalizedChapterId) {
      const { error: linkError } = await supabase
        .from("tasks")
        .update({
          bucket_id: normalizedBucketId,
          chapter_id: normalizedChapterId,
        })
        .eq("id", taskId)
        .eq("user_id", userId);

      if (linkError) {
        throw new Error(`과제 연결 저장 실패: ${linkError.message}`);
      }
    }

    if (adjustmentRows.length > 0) {
      const { error: adjustmentError } = await supabase
        .from("difficulty_adjustments")
        .insert(adjustmentRows);

      if (adjustmentError) {
        console.error("difficulty_adjustments insert failed", adjustmentError);
      }
    }

    return { success: true, taskId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.",
    };
  }
}

// ─── 메모 템플릿 관련 액션 ──────────────────────────────────

/**
 * 메모 템플릿 목록 조회 — 현재 사용자의 모든 템플릿 반환
 */
export async function getMemoTemplatesAction(): Promise<{
  success: boolean;
  data?: MemoTemplate[];
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthUserId();

    const { data, error } = await supabase
      .from("memo_templates")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    return { success: true, data: (data ?? []) as MemoTemplate[] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "템플릿 조회 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 메모 템플릿 저장 — label과 content로 새 템플릿 생성
 */
export async function saveMemoTemplateAction(
  label: string,
  content: string
): Promise<{
  success: boolean;
  data?: MemoTemplate;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthUserId();

    const trimmedLabel = label.trim();
    const trimmedContent = content.trim();

    if (!trimmedLabel) throw new Error("템플릿 이름을 입력해주세요.");
    if (!trimmedContent) throw new Error("메모 내용이 비어있습니다.");

    // 현재 최대 sort_order 조회
    const { data: existing } = await supabase
      .from("memo_templates")
      .select("sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from("memo_templates")
      .insert({
        user_id: userId,
        label: trimmedLabel,
        content: trimmedContent,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return { success: true, data: data as MemoTemplate };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "템플릿 저장 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 메모 템플릿 삭제 — 소유권 확인 후 삭제
 */
export async function deleteMemoTemplateAction(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthUserId();

    const { error } = await supabase
      .from("memo_templates")
      .delete()
      .eq("id", templateId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "템플릿 삭제 중 오류가 발생했습니다.",
    };
  }
}
