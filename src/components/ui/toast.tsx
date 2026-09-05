"use client";

import { cn } from "@/lib/utils";
import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error";

/** 토스트 안의 되돌리기 버튼 — "실행취소"처럼 방금 한 일을 되돌리는 자리 */
interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  action?: ToastAction;
  /** 기본 3초. 되돌릴 기회를 주는 토스트는 더 길게 잡는다 */
  durationMs?: number;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3000;
/** 실행취소가 붙은 토스트 — 문장을 읽고 누를 시간이 필요하다 */
const ACTION_DURATION_MS = 7000;

// 토스트 알림 Provider — 기본 3초 자동 닫힘
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "success", options?: ToastOptions) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
      const duration =
        options?.durationMs ?? (options?.action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* 토스트 렌더링 영역 */}
      {/* z-[60] — 바텀시트(z-50, body 포털)보다 위. 같은 z-50이던 시절엔 DOM 순서상
          나중인 시트가 항상 덮어, 시트가 열린 동안 토스트가 통째로 보이지 않았다. */}
      <div className="fixed bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+0.75rem)] left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[90%] max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium shadow-strong animate-[fadeIn_0.2s_ease-out]",
              // 성공은 무채색(앱 흑백 톤 — 라이트/다크가 자동 반전).
              // 실패만 빨강을 남긴다 — 조용히 지나가면 안 되는 신호라서.
              t.type === "success"
                ? "bg-inverse-background text-inverse-label"
                : "bg-red-600 text-white"
            )}
          >
            <span className="min-w-0 flex-1 break-words whitespace-pre-wrap max-h-40 overflow-y-auto">
              {t.message}
            </span>
            {t.action && (
              // 되돌리기 — 누르면 즉시 닫는다. 남겨두면 두 번 눌릴 수 있다.
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.onClick();
                }}
                className="shrink-0 rounded px-2 py-1 text-sm font-bold underline underline-offset-2 opacity-90 transition-opacity hover:opacity-100"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// useToast 훅
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast는 ToastProvider 내부에서 사용해야 합니다.");
  }
  return context;
}
