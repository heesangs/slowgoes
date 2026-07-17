"use client";

// 키보드 상단 고정 입력창 (Input Accessory View 패턴).
//
// 모바일 소프트 키보드가 올라올 때 입력 바가 키보드 상단에 딱 붙는다.
// - Android: 뷰포트 자체가 축소 → visualViewport.height 반영으로 자동 대응
// - iOS Safari: 키보드가 뷰포트를 덮고 스크롤이 밀림 → visualViewport의
//   height/offsetTop을 구독해 bottom(px)을 동적 계산으로 방어
// - 키보드 내려간 상태: env(safe-area-inset-bottom)으로 홈 인디케이터 회피
//
// 재사용: 좌/우 액션 슬롯(leftActions/rightActions)로 AI 버튼·반복 버튼 등 확장.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface KeyboardAccessoryInputProps {
  open: boolean;
  onClose: () => void;
  /** 확정(전송) — 공백이면 호출되지 않음 */
  onSubmit: (value: string) => void;
  /** 오픈 시 초기값 (수정 모드 프리필) */
  initialValue?: string;
  placeholder?: string;
  /** 전송 버튼 라벨 (기본 "추가") */
  submitLabel?: string;
  /** 입력창 좌측 슬롯 (예: 반복 버튼) */
  leftActions?: ReactNode;
  /** 입력창 우측 슬롯 (예: AI 생성 버튼) */
  rightActions?: ReactNode;
  /** 외부에서 입력값을 갱신해야 할 때(예: AI 생성 결과 주입) 사용 */
  value?: string;
  onValueChange?: (value: string) => void;
  /** 전송 진행 중 비활성화 */
  isSubmitting?: boolean;
}

export function KeyboardAccessoryInput({
  open,
  onClose,
  onSubmit,
  initialValue = "",
  placeholder,
  submitLabel = "추가",
  leftActions,
  rightActions,
  value: controlledValue,
  onValueChange,
  isSubmitting = false,
}: KeyboardAccessoryInputProps) {
  const [mounted, setMounted] = useState(false);
  const [innerValue, setInnerValue] = useState(initialValue);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : innerValue;

  function setValue(next: string) {
    if (onValueChange) onValueChange(next);
    if (!isControlled) setInnerValue(next);
  }

  useEffect(() => setMounted(true), []);

  // 오픈 시 초기값 리셋 + 포커스(키보드 유도)
  useEffect(() => {
    if (!open) return;
    if (!isControlled) setInnerValue(initialValue);
    // iOS는 사용자 제스처 직후가 아니면 포커스로 키보드가 안 뜰 수 있어
    // 다음 프레임에 시도(최선 노력).
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // visualViewport 구독 — 키보드 높이만큼 입력 바를 끌어올린다.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return; // 미지원 브라우저: safe-area 패딩만으로 동작

    const update = () => {
      // 레이아웃 뷰포트 대비 가시 영역이 줄어든 만큼(키보드 높이)을 bottom으로.
      // iOS에서 페이지가 밀렸을 때는 offsetTop이 보정해준다.
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

  if (!mounted || !open) return null;

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(trimmed);
  }

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* 오버레이 — 탭하면 닫힘 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30"
      />

      {/* 입력 바 — 키보드 상단 고정. keyboardOffset(px)으로 동적 부착 */}
      <div
        className="fixed inset-x-0 w-full bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
        style={{ bottom: keyboardOffset }}
      >
        <div
          className={cn(
            "mx-auto flex max-w-2xl items-center gap-2 px-3 py-2",
            // 키보드가 내려가 있을 때만 홈 인디케이터 회피 (키보드 위에서는 불필요)
            keyboardOffset === 0 && "pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          )}
        >
          {leftActions}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // 한글 조합 중 Enter 중복 방지
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder}
            disabled={isSubmitting}
            className="min-w-0 flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-foreground/35 focus:border-foreground/40 disabled:opacity-50"
          />
          {rightActions}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-30"
          >
            {isSubmitting ? "…" : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
