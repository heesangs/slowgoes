"use client";

// 키보드 상단 고정 입력창 (Input Accessory View 패턴) — 피그마 32502-1352 / 상태정의 32502-1212.
//
// 구조: [자동 확장 textarea(1~5줄, 초과 시 내부 스크롤)]
//       [하단 행: 액션 버튼들(반복·AI 등)  ···  ↑ 전송(텍스트 있을 때만)]
//
// 모바일 대응:
// - visualViewport 구독 → 키보드 높이만큼 paddingBottom을 채워 서피스가 키보드에 밀착
//   (bottom 오프셋 방식과 달리 반영이 늦어도 갭이 배경색으로 채워진다)
// - 시스템(OS) 테마 추종 서피스(--kai-*): 키보드가 OS 테마를 따르므로 한 몸처럼 보이게
// - iOS 키보드 즉시 오픈: 항상 마운트(닫힘=opacity-0) + ref.focus()를 클릭 핸들러에서
//   동기 호출하면 사용자 제스처 컨텍스트가 유지되어 키보드가 뜬다
// - 오픈 동안 배경 스크롤 잠금(useLockBodyScroll)
// - textarea 16px → iOS 포커스 자동 확대 없음 (viewport maximumScale과 이중 방어)

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import { cn } from "@/lib/utils";

const MAX_LINES = 5;
const LINE_HEIGHT_PX = 24; // 16px * 1.5

export interface KeyboardAccessoryInputHandle {
  /** 클릭 핸들러에서 동기 호출 — iOS 소프트 키보드 오픈 보장용 */
  focus: () => void;
}

interface KeyboardAccessoryInputProps {
  open: boolean;
  onClose: () => void;
  /** 확정(전송) — 공백이면 호출되지 않음 */
  onSubmit: (value: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** 하단 행 좌측 액션들 (반복·AI 버튼 등) */
  actions?: ReactNode;
  /** 전송 진행 중 — 입력/전송 잠금 */
  isSubmitting?: boolean;
  /** AI 생성 중 — 입력 잠금 + busyPlaceholder 표시 */
  isBusy?: boolean;
  /** isBusy 동안 표시할 안내 (예: "{버킷} 관련 추천중...") */
  busyPlaceholder?: string;
}

export const KeyboardAccessoryInput = forwardRef<
  KeyboardAccessoryInputHandle,
  KeyboardAccessoryInputProps
>(function KeyboardAccessoryInput(
  {
    open,
    onClose,
    onSubmit,
    value,
    onValueChange,
    placeholder,
    actions,
    isSubmitting = false,
    isBusy = false,
    busyPlaceholder,
  },
  ref
) {
  const [mounted, setMounted] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => setMounted(true), []);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  // 오픈 동안 배경 스크롤 잠금
  useLockBodyScroll(open);

  // textarea 자동 확장 (1~5줄, 초과 시 내부 스크롤)
  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = MAX_LINES * LINE_HEIGHT_PX;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  // 값이 외부에서 바뀔 때(AI 주입/드래프트 복원)도 높이 갱신
  useEffect(() => {
    resizeTextarea();
  }, [value, open]);

  // visualViewport 구독 — 키보드 높이만큼 하단을 서피스로 채운다
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, Math.round(offset)));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKeyboardOffset(0);
    };
  }, [open]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const trimmed = value.trim();
  const locked = isSubmitting || isBusy;
  const canSubmit = trimmed.length > 0 && !locked;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(trimmed);
  }

  return createPortal(
    // 항상 마운트 — 닫힘 상태는 opacity-0 (visibility:hidden은 focus 불가라 사용 금지)
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!open}
      role="dialog"
      aria-modal={open || undefined}
    >
      {/* 오버레이 — 탭하면 닫힘. 배경 오버스크롤 차단 */}
      <button
        type="button"
        aria-label="닫기"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default touch-none overscroll-contain bg-black/30"
      />

      {/* 입력 서피스 — 키보드 상단 밀착. paddingBottom으로 키보드까지 배경을 채움 */}
      <div
        className="fixed inset-x-0 bottom-0 w-full"
        style={{
          background: "var(--kai-surface)",
          color: "var(--kai-text)",
          paddingBottom: keyboardOffset,
        }}
      >
        <div
          className={cn(
            "mx-auto flex max-w-2xl flex-col gap-2 px-4 pt-3",
            // 키보드 없을 때만 홈 인디케이터 회피
            keyboardOffset === 0 ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "pb-3"
          )}
        >
          {/* 1단: 자동 확장 입력 */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onValueChange(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={(e) => {
              // 데스크톱 보조: Cmd/Ctrl+Enter 전송 (Enter는 줄바꿈)
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={isBusy ? (busyPlaceholder ?? placeholder) : placeholder}
            readOnly={locked}
            rows={1}
            tabIndex={open ? 0 : -1}
            className="w-full resize-none bg-transparent text-[16px] leading-6 outline-none placeholder:text-[var(--kai-placeholder)]"
            style={{ color: "var(--kai-text)" }}
          />

          {/* 2단: 좌측 액션(반복·AI) + 우측 ↑ 전송 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">{actions}</div>
            {(trimmed.length > 0 || isBusy) && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                aria-label="전송"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-opacity disabled:opacity-40"
                style={{ background: "var(--kai-accent)", color: "var(--kai-accent-text)" }}
              >
                {isSubmitting ? (
                  <span className="text-xs">…</span>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});
