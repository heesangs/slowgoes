"use client";

import { cn } from "@/lib/utils";
import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// 토스트 알림 Provider — 3초 자동 닫힘
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

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
              "px-4 py-3 rounded-lg text-sm font-medium shadow-lg animate-[fadeIn_0.2s_ease-out] break-words whitespace-pre-wrap max-h-40 overflow-y-auto",
              t.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            )}
          >
            {t.message}
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
