"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TaskCard } from "@/components/dashboard/task-card";
import { useToast } from "@/components/ui/toast";
import { formatMinutes } from "@/lib/utils";
import { deleteTaskAction } from "@/app/(main)/tasks/actions";
import type { TaskWithSubtasks } from "@/types";

interface AllTasksViewProps {
  tasks: TaskWithSubtasks[];
  displayName: string | null;
  showHeader?: boolean;
  showFab?: boolean;
}

export function AllTasksView({
  tasks,
  displayName,
  showHeader = true,
  showFab = true,
}: AllTasksViewProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [completedOpen, setCompletedOpen] = useState(false);
  const [optimisticTasks, setOptimisticTasks] = useState(tasks);

  useEffect(() => {
    setOptimisticTasks(tasks);
  }, [tasks]);

  async function handleDelete(taskId: string) {
    const deletedTask = optimisticTasks.find((task) => task.id === taskId);

    setOptimisticTasks((prev) => prev.filter((task) => task.id !== taskId));
    toast("할일을 삭제했습니다.", "success");

    const result = await deleteTaskAction(taskId);
    if (result.success) {
      router.refresh();
      return;
    }

    if (deletedTask) {
      setOptimisticTasks((prev) => [...prev, deletedTask]);
    }
    toast(result.error ?? "삭제 중 오류가 발생했습니다.", "error");
  }

  const activeTasks = optimisticTasks
    .filter((task) => task.status !== "completed")
    .sort((a, b) => {
      if (a.status === "in_progress" && b.status !== "in_progress") return -1;
      if (a.status !== "in_progress" && b.status === "in_progress") return 1;
      return 0;
    });
  const completedTasks = optimisticTasks.filter((task) => task.status === "completed");

  const totalMinutes = optimisticTasks.reduce(
    (sum, task) => sum + (task.total_estimated_minutes ?? 0),
    0
  );
  const totalSubtasks = optimisticTasks.reduce(
    (sum, task) => sum + (task.subtasks?.length ?? 0),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      {showHeader && (
        <div>
          <h1 className="text-xl font-bold">안녕, {displayName || "친구"} 👋</h1>
          <p className="text-sm text-foreground/60 mt-1">
            {optimisticTasks.length > 0
              ? `${optimisticTasks.length}개 할일, ${totalSubtasks}개 세부 단계, 총 ${formatMinutes(totalMinutes)}`
              : "등록된 할일이 없어요"}
          </p>
        </div>
      )}

      {optimisticTasks.length === 0 && (
        <div className="rounded-lg border border-dashed border-foreground/20 px-4 py-4">
          <p className="text-sm text-foreground/70">등록된 할일이 없어요.</p>
        </div>
      )}

      {activeTasks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground/50 mb-3">진행 중</h2>
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
            {activeTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onDelete={() => handleDelete(task.id)}
                isDeleting={false}
              />
            ))}
          </div>
        </section>
      )}

      {completedTasks.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setCompletedOpen((prev) => !prev)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground/50 mb-3 min-h-[44px] cursor-pointer"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="currentColor"
              className={`transition-transform ${completedOpen ? "rotate-90" : ""}`}
            >
              <path d="M4 2L9 6L4 10V2Z" />
            </svg>
            완료 ({completedTasks.length})
          </button>

          {completedOpen && (
            <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
              {completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onDelete={() => handleDelete(task.id)}
                  isDeleting={false}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {showFab && (
        <Link
          href="/tasks/new"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-90 active:opacity-80 transition-opacity"
          aria-label="할일 추가하기"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </Link>
      )}
    </div>
  );
}
