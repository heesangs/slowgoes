"use client";

// 과제 입력 폼 — 제목 필수 + 메모·단계 수·목표 시간·마감일 선택 확장 폼

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveMemoTemplateAction, deleteMemoTemplateAction } from "@/app/(main)/tasks/actions";
import type { MemoTemplate, TaskInputData, UserContext } from "@/types";

// userContext별 placeholder 맵
const PLACEHOLDERS: Record<UserContext | "default", string> = {
  student: "예: 수학 중간고사 준비",
  university: "예: 경영학 기말 레포트",
  work: "예: 신규 기능 디자인 시안 제작",
  personal: "예: '원씽' 읽고 독서노트 쓰기",
  default: "예: 이번 주에 끝내고 싶은 일",
};

// 단계 수 칩 옵션 (undefined = AI 추천)
const SUBTASK_COUNT_OPTIONS: Array<{ label: string; value: number | undefined }> = [
  { label: "AI 추천", value: undefined },
  { label: "3", value: 3 },
  { label: "5", value: 5 },
  { label: "7", value: 7 },
  { label: "10", value: 10 },
];

// 목표 시간 칩 옵션 (undefined = AI 추천)
const DURATION_OPTIONS: Array<{ label: string; value: number | undefined }> = [
  { label: "AI 추천", value: undefined },
  { label: "30분", value: 30 },
  { label: "1시간", value: 60 },
  { label: "2시간", value: 120 },
  { label: "3시간+", value: 180 },
];

interface TaskInputFormProps {
  onSubmit: (data: TaskInputData) => void;
  isLoading: boolean;
  userContext?: UserContext[];
  memoTemplates?: MemoTemplate[];
  onTemplatesChange?: (templates: MemoTemplate[]) => void;
}

export function TaskInputForm({
  onSubmit,
  isLoading,
  userContext,
  memoTemplates = [],
  onTemplatesChange,
}: TaskInputFormProps) {
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [memo, setMemo] = useState("");
  const [subtaskCount, setSubtaskCount] = useState<number | undefined>(undefined);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [dueDate, setDueDate] = useState("");

  // 메모 템플릿 저장 관련 상태
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [templateLabel, setTemplateLabel] = useState("");
  const { toast } = useToast();

  // userContext 첫 번째 값으로 placeholder 결정
  const firstContext = userContext?.[0];
  const placeholder = firstContext
    ? PLACEHOLDERS[firstContext]
    : PLACEHOLDERS["default"];

  // 오늘 날짜 (min 값용)
  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    onSubmit({
      title: trimmed,
      memo: memo.trim() || undefined,
      desiredSubtaskCount: subtaskCount,
      targetDurationMinutes: duration,
      dueDate: dueDate || undefined,
    });

    // 확장 폼 접기
    setExpanded(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 제목 입력 */}
      <Input
        id="task-title"
        label="할 일 입력"
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={isLoading}
        autoFocus
      />

      {/* 확장 토글 버튼 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={isLoading}
        className="flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground/80 transition-colors w-fit"
      >
        <span>더 자세히 알려주기</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${expanded ? "rotate-180" : "rotate-0"}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 확장 영역 */}
      <div
        className={`flex flex-col gap-4 overflow-hidden transition-all duration-200 ease-in-out ${
          expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {/* 메모 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-memo" className="text-sm font-medium">
            메모 <span className="text-foreground/40 font-normal">(선택)</span>
          </label>
          <div className="relative">
            <textarea
              id="task-memo"
              rows={3}
              maxLength={500}
              placeholder="과제에 대해 더 자세히 설명해주세요. AI가 더 정확하게 분석할 수 있어요."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none disabled:opacity-50"
            />
            <span className="absolute bottom-2 right-3 text-xs text-foreground/40">
              {memo.length}/500
            </span>
          </div>

          {/* 메모 템플릿 태그 목록 + 저장 버튼 */}
          <div className="flex flex-col gap-2">
            {/* 저장된 템플릿 태그 */}
            {memoTemplates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {memoTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => setMemo(tpl.content)}
                    className="group flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-border bg-background text-foreground/70 hover:border-primary/60 hover:text-primary transition-colors"
                  >
                    <span>{tpl.label}</span>
                    {/* 삭제 x 버튼 */}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${tpl.label} 템플릿 삭제`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const result = await deleteMemoTemplateAction(tpl.id);
                        if (result.success) {
                          onTemplatesChange?.(
                            memoTemplates.filter((t) => t.id !== tpl.id)
                          );
                          toast("템플릿을 삭제했습니다.", "success");
                        } else {
                          toast(result.error ?? "삭제에 실패했습니다.", "error");
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          (e.target as HTMLElement).click();
                        }
                      }}
                      className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-foreground/40 hover:text-red-500"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 템플릿 저장 영역 */}
            {memo.trim() && (
              <div className="flex items-center gap-2">
                {showLabelInput ? (
                  <>
                    <input
                      type="text"
                      maxLength={20}
                      placeholder="템플릿 이름 (예: 디자인 가이드)"
                      value={templateLabel}
                      onChange={(e) => setTemplateLabel(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!templateLabel.trim()) return;
                          setIsSavingTemplate(true);
                          const result = await saveMemoTemplateAction(
                            templateLabel.trim(),
                            memo.trim()
                          );
                          setIsSavingTemplate(false);
                          if (result.success && result.data) {
                            onTemplatesChange?.([...memoTemplates, result.data]);
                            toast("템플릿이 저장되었습니다.", "success");
                            setShowLabelInput(false);
                            setTemplateLabel("");
                          } else {
                            toast(result.error ?? "저장에 실패했습니다.", "error");
                          }
                        }
                        if (e.key === "Escape") {
                          setShowLabelInput(false);
                          setTemplateLabel("");
                        }
                      }}
                      disabled={isSavingTemplate}
                      autoFocus
                      className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={!templateLabel.trim() || isSavingTemplate}
                      onClick={async () => {
                        if (!templateLabel.trim()) return;
                        setIsSavingTemplate(true);
                        const result = await saveMemoTemplateAction(
                          templateLabel.trim(),
                          memo.trim()
                        );
                        setIsSavingTemplate(false);
                        if (result.success && result.data) {
                          onTemplatesChange?.([...memoTemplates, result.data]);
                          toast("템플릿이 저장되었습니다.", "success");
                          setShowLabelInput(false);
                          setTemplateLabel("");
                        } else {
                          toast(result.error ?? "저장에 실패했습니다.", "error");
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isSavingTemplate ? "저장 중..." : "저장"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLabelInput(false);
                        setTemplateLabel("");
                      }}
                      className="text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => setShowLabelInput(true)}
                    className="flex items-center gap-1 text-xs text-foreground/50 hover:text-primary transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    <span>템플릿으로 저장</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 단계 수 칩 */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            단계 수 <span className="text-foreground/40 font-normal">(선택)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {SUBTASK_COUNT_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                disabled={isLoading}
                onClick={() => setSubtaskCount(opt.value)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  subtaskCount === opt.value
                    ? "bg-primary text-white"
                    : "border border-border bg-background text-foreground/70 hover:border-primary/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 목표 시간 칩 */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            목표 시간 <span className="text-foreground/40 font-normal">(선택)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                disabled={isLoading}
                onClick={() => setDuration(opt.value)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  duration === opt.value
                    ? "bg-primary text-white"
                    : "border border-border bg-background text-foreground/70 hover:border-primary/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 마감일 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="task-due-date" className="text-sm font-medium">
            마감일 <span className="text-foreground/40 font-normal">(선택)</span>
          </label>
          <input
            id="task-due-date"
            type="date"
            min={today}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          />
        </div>
      </div>

      {/* 제출 버튼 */}
      <Button type="submit" isLoading={isLoading} disabled={!title.trim()}>
        {isLoading ? "분석 중..." : "분석하기"}
      </Button>
    </form>
  );
}
