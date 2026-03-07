// 공통 타입 정의

export type TaskStatus = "pending" | "in_progress" | "completed";

export type Difficulty = "easy" | "medium" | "hard";

export type SelfLevel = "low" | "medium" | "high";

export type UserContext = "student" | "university" | "work" | "personal";

export interface Profile {
  id: string;
  display_name: string | null;
  grade: string | null;
  subjects: string[] | null;
  self_level: SelfLevel;
  user_context: UserContext[];
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  status: TaskStatus;
  total_estimated_minutes: number | null;
  total_actual_minutes: number | null;
  created_at: string;
  completed_at: string | null;
  memo?: string | null;
  desired_subtask_count?: number | null;
  target_duration_minutes?: number | null;
  due_date?: string | null; // ISO date "YYYY-MM-DD"
}

// 폼 → 액션 전달용 입력 데이터
export interface TaskInputData {
  title: string;
  memo?: string;
  desiredSubtaskCount?: number; // undefined = AI 추천
  targetDurationMinutes?: number; // undefined = AI 추천
  dueDate?: string; // ISO date "YYYY-MM-DD"
}

export interface Subtask {
  id: string;
  task_id: string;
  parent_subtask_id: string | null;
  depth: number;
  title: string;
  difficulty: Difficulty;
  ai_suggested_difficulty: Difficulty | null;
  estimated_minutes: number;
  ai_suggested_minutes: number | null;
  actual_minutes: number | null;
  sort_order: number;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

// AI 응답용 하위 과제 제안 타입
export interface AISubtaskSuggestion {
  title: string;
  difficulty: Difficulty;
  estimated_minutes: number;
}

// 과제 + 하위 과제 조인 타입
export interface TaskWithSubtasks extends Task {
  subtasks: Subtask[];
}

// 과제 통계 타입
export interface TaskStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  totalSubtasks: number;
  completedSubtasks: number;
  estimatedMinutesTotal: number;
  actualMinutesTotal: number;
  difficultyDistribution: { easy: number; medium: number; hard: number };
}

// 클라이언트 편집용 하위 과제 타입
export interface EditableSubtask {
  temp_id: string;
  parent_temp_id: string | null;
  depth: number;
  title: string;
  difficulty: Difficulty;
  ai_suggested_difficulty: Difficulty;
  estimated_minutes: number;
  ai_suggested_minutes: number;
  sort_order: number;
  is_decomposing: boolean;
}

// 메모 템플릿 타입
export interface MemoTemplate {
  id: string;
  user_id: string;
  label: string;
  content: string;
  sort_order: number;
  created_at: string;
}
