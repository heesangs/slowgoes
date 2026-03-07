"use client";

// 과제 생성 오케스트레이터 — useReducer로 phase 및 하위 과제 상태 관리

import { useEffect, useReducer, useState } from "react";
import { TaskInputForm } from "./task-input-form";
import { SubtaskList } from "./subtask-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { analyzeTaskAction, decomposeSubtaskAction, getMemoTemplatesAction, saveTaskAction } from "@/app/(main)/tasks/actions";
import type { Difficulty, EditableSubtask, AISubtaskSuggestion, MemoTemplate, TaskInputData, UserContext } from "@/types";

// 상태 타입
type Phase = "input" | "analyzing" | "editing" | "saving";

interface State {
  phase: Phase;
  taskTitle: string;
  taskInputData: TaskInputData | null;
  subtasks: EditableSubtask[];
}

// 액션 타입
type Action =
  | { type: "START_ANALYZE"; data: TaskInputData }
  | { type: "ANALYZE_SUCCESS"; suggestions: AISubtaskSuggestion[] }
  | { type: "ANALYZE_FAIL" }
  | { type: "CHANGE_DIFFICULTY"; tempId: string; difficulty: Difficulty }
  | { type: "CHANGE_TIME"; tempId: string; delta: number }
  | { type: "START_DECOMPOSE"; tempId: string }
  | { type: "DECOMPOSE_SUCCESS"; parentTempId: string; suggestions: AISubtaskSuggestion[] }
  | { type: "DECOMPOSE_FAIL"; tempId: string }
  | { type: "START_SAVE" }
  | { type: "SAVE_FAIL" }
  | { type: "RESET" };

// AI 제안 → EditableSubtask 변환
function suggestionsToEditable(
  suggestions: AISubtaskSuggestion[],
  parentTempId: string | null,
  depth: number
): EditableSubtask[] {
  return suggestions.map((s, i) => ({
    temp_id: crypto.randomUUID(),
    parent_temp_id: parentTempId,
    depth,
    title: s.title,
    difficulty: s.difficulty,
    ai_suggested_difficulty: s.difficulty,
    estimated_minutes: s.estimated_minutes,
    ai_suggested_minutes: s.estimated_minutes,
    sort_order: i,
    is_decomposing: false,
  }));
}

// 특정 부모의 모든 하위 노드(자손) temp_id 수집
function collectDescendantTempIds(
  subtasks: EditableSubtask[],
  parentTempId: string
): Set<string> {
  const descendantIds = new Set<string>();
  const queue: string[] = [parentTempId];

  while (queue.length > 0) {
    const currentParentId = queue.shift();
    if (!currentParentId) continue;

    subtasks.forEach((subtask) => {
      if (
        subtask.parent_temp_id === currentParentId &&
        !descendantIds.has(subtask.temp_id)
      ) {
        descendantIds.add(subtask.temp_id);
        queue.push(subtask.temp_id);
      }
    });
  }

  return descendantIds;
}

const initialState: State = {
  phase: "input",
  taskTitle: "",
  taskInputData: null,
  subtasks: [],
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "START_ANALYZE":
      return {
        ...state,
        phase: "analyzing",
        taskTitle: action.data.title,
        taskInputData: action.data,
      };

    case "ANALYZE_SUCCESS":
      return {
        ...state,
        phase: "editing",
        subtasks: suggestionsToEditable(action.suggestions, null, 0),
      };

    case "ANALYZE_FAIL":
      return { ...state, phase: "input" };

    case "CHANGE_DIFFICULTY":
      return {
        ...state,
        subtasks: state.subtasks.map((s) =>
          s.temp_id === action.tempId ? { ...s, difficulty: action.difficulty } : s
        ),
      };

    case "CHANGE_TIME": {
      return {
        ...state,
        subtasks: state.subtasks.map((s) => {
          if (s.temp_id !== action.tempId) return s;
          const newMinutes = Math.max(5, Math.min(120, s.estimated_minutes + action.delta));
          return { ...s, estimated_minutes: newMinutes };
        }),
      };
    }

    case "START_DECOMPOSE":
      return {
        ...state,
        subtasks: state.subtasks.map((s) =>
          s.temp_id === action.tempId ? { ...s, is_decomposing: true } : s
        ),
      };

    case "DECOMPOSE_SUCCESS": {
      // 기존 자식/자손 제거 후 새 자식 추가
      const descendantIds = collectDescendantTempIds(
        state.subtasks,
        action.parentTempId
      );
      const filtered = state.subtasks.filter(
        (s) => !descendantIds.has(s.temp_id)
      );
      const parent = filtered.find((s) => s.temp_id === action.parentTempId);
      const newDepth = (parent?.depth ?? 0) + 1;
      const newChildren = suggestionsToEditable(action.suggestions, action.parentTempId, newDepth);
      return {
        ...state,
        subtasks: [
          ...filtered.map((s) =>
            s.temp_id === action.parentTempId ? { ...s, is_decomposing: false } : s
          ),
          ...newChildren,
        ],
      };
    }

    case "DECOMPOSE_FAIL":
      return {
        ...state,
        subtasks: state.subtasks.map((s) =>
          s.temp_id === action.tempId ? { ...s, is_decomposing: false } : s
        ),
      };

    case "START_SAVE":
      return { ...state, phase: "saving" };

    case "SAVE_FAIL":
      return { ...state, phase: "editing" };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

interface TaskCreatorProps {
  userContext?: UserContext[];
}

export function TaskCreator({ userContext }: TaskCreatorProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { toast } = useToast();

  // 메모 템플릿 상태 관리
  const [memoTemplates, setMemoTemplates] = useState<MemoTemplate[]>([]);

  // 마운트 시 메모 템플릿 목록 로드
  useEffect(() => {
    async function loadTemplates() {
      const result = await getMemoTemplatesAction();
      if (result.success && result.data) {
        setMemoTemplates(result.data);
      }
    }
    loadTemplates();
  }, []);

  // 과제 분석 요청
  const handleAnalyze = async (data: TaskInputData) => {
    dispatch({ type: "START_ANALYZE", data });
    const result = await analyzeTaskAction(data);
    if (result.success && result.data) {
      dispatch({ type: "ANALYZE_SUCCESS", suggestions: result.data });
    } else {
      dispatch({ type: "ANALYZE_FAIL" });
      toast(result.error || "분석에 실패했습니다.", "error");
    }
  };

  // 난이도 변경
  const handleChangeDifficulty = (tempId: string, difficulty: Difficulty) => {
    dispatch({ type: "CHANGE_DIFFICULTY", tempId, difficulty });
  };

  // 시간 변경
  const handleChangeTime = (tempId: string, delta: number) => {
    dispatch({ type: "CHANGE_TIME", tempId, delta });
  };

  // 하위 과제 추가 분해
  const handleDecompose = async (tempId: string) => {
    const subtask = state.subtasks.find((s) => s.temp_id === tempId);
    if (!subtask) return;

    dispatch({ type: "START_DECOMPOSE", tempId });
    const result = await decomposeSubtaskAction(subtask.title, state.taskTitle);
    if (result.success && result.data) {
      dispatch({ type: "DECOMPOSE_SUCCESS", parentTempId: tempId, suggestions: result.data });
    } else {
      dispatch({ type: "DECOMPOSE_FAIL", tempId });
      toast(result.error || "분해에 실패했습니다.", "error");
    }
  };

  // 과제 저장
  const handleSave = async () => {
    dispatch({ type: "START_SAVE" });
    const result = await saveTaskAction({
      title: state.taskTitle,
      subtasks: state.subtasks,
      memo: state.taskInputData?.memo,
      desiredSubtaskCount: state.taskInputData?.desiredSubtaskCount,
      targetDurationMinutes: state.taskInputData?.targetDurationMinutes,
      dueDate: state.taskInputData?.dueDate,
    });
    if (result.success) {
      toast("과제가 저장되었습니다.", "success");
      dispatch({ type: "RESET" });
    } else {
      dispatch({ type: "SAVE_FAIL" });
      toast(result.error || "저장에 실패했습니다.", "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 제목 */}
      <div>
        <h1 className="text-xl font-bold">새 과제 만들기</h1>
        <p className="text-sm text-foreground/60 mt-1">
          과제를 입력하면 AI가 단계별로 나눠줍니다.
        </p>
      </div>

      {/* 입력 / 분석 중 단계 */}
      {(state.phase === "input" || state.phase === "analyzing") && (
        <Card>
          <CardContent>
            <TaskInputForm
              onSubmit={handleAnalyze}
              isLoading={state.phase === "analyzing"}
              userContext={userContext}
              memoTemplates={memoTemplates}
              onTemplatesChange={setMemoTemplates}
            />
          </CardContent>
        </Card>
      )}

      {/* 편집 / 저장 중 단계 */}
      {(state.phase === "editing" || state.phase === "saving") && (
        <>
          {/* 과제 제목 표시 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{state.taskTitle}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: "RESET" })}
                >
                  다시 입력
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <SubtaskList
                subtasks={state.subtasks}
                onChangeDifficulty={handleChangeDifficulty}
                onChangeTime={handleChangeTime}
                onDecompose={handleDecompose}
              />
            </CardContent>
          </Card>

          {/* 저장 버튼 */}
          <Button
            onClick={handleSave}
            isLoading={state.phase === "saving"}
            size="lg"
            className="w-full"
          >
            {state.phase === "saving" ? "저장 중..." : "확인"}
          </Button>
        </>
      )}
    </div>
  );
}
