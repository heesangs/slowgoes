"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "default" | "large"; // default=60vh, large=85vh
  /** 헤더 우측 액션 — 지정 시 기본 "닫기" 버튼을 대체 (닫기는 배경 탭/ESC/아래로 끌기) */
  headerAction?: React.ReactNode;
  /** 타이틀+닫기 헤더 행을 숨긴다(드래그 핸들은 유지). 닫기는 배경 탭/ESC/아래로 끌기 */
  hideHeader?: boolean;
}

// 슬라이드 인/아웃 + **아래로 끌어 닫기**.
//   내용이 길어 배경이 안 보이고 닫기 버튼도 없는 시트(주간 시트 등)는 닫기가 어려웠다.
//   손가락을 따라 내려가다 임계 이상이면 닫히고, 미달이면 제자리로 돌아온다.
const ANIM_MS = 240; // 슬라이드 인/아웃
const SNAP_MS = 200; // 임계 미달 시 제자리 복귀
const DRAG_START_PX = 8; // 이만큼 내려야 드래그로 인정 (탭·스크롤과 구분 — TodoRow와 같은 값)
const DISMISS_PX = 100; // 닫힘 최소 거리
const DISMISS_RATIO = 0.25; // 또는 패널 높이의 25%
const FLICK_VELOCITY = 0.5; // px/ms — 짧아도 빠르게 튕기면 닫는다

// PR 37: createPortal로 document.body에 mount.
//   기존엔 호출 컴포넌트(예: dashboard-content-v2)의 DOM 트리 안에 fixed가 렌더되었는데,
//   부모 chain에 transform/filter/will-change/perspective 등이 있으면 "containing block"이
//   viewport 대신 그 ancestor가 되어 `fixed inset-0 + bottom-0`이 viewport가 아닌
//   ancestor 내부 하단을 가리킴 → 시트가 화면 상단/중앙 등 엉뚱한 위치에 노출.
//   Portal로 body 자식이 되면 어떤 부모 transform도 영향을 못 미침.
export function BottomSheet({ open, onClose, title, children, footer, size = "default", headerAction, hideHeader = false }: BottomSheetProps) {
  // 앱 전체 모션 정책과 동일 — 줄이기 설정이면 애니메이션 없이 즉시 전환
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const animMs = reduced ? 0 : ANIM_MS;

  // 닫힐 때 슬라이드 아웃을 보여주려면 open=false 이후에도 잠시 살아 있어야 한다.
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true); // 렌더 중 조정 — 열림은 즉시 마운트

  // 배경 스크롤 잠금 (iOS 대응 포함)은 **마운트되어 있는 동안** 유지한다.
  // open 기준으로 풀면 슬라이드 아웃 중에 배경이 먼저 움직여(스크롤 위치 복원) 튄다.
  useLockBodyScroll(rendered);

  // 실제 위치. 마운트 다음 프레임에 true가 되며 아래에서 올라온다.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // rAF 콜백에서 갱신한다 — 마운트 프레임과 분리해야 트랜지션이 실제로 재생된다
    const raf = requestAnimationFrame(() => setShown(open));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // 슬라이드 아웃이 끝나면 언마운트
  useEffect(() => {
    if (open || !rendered) return;
    const timer = setTimeout(() => setRendered(false), animMs);
    return () => clearTimeout(timer);
  }, [open, rendered, animMs]);

  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── 아래로 끌어 닫기 ──
  // 프로젝트의 기존 제스처 관례(TodoRow 스와이프 삭제)와 같은 구조:
  //   pointerdown에 시작점만 기록 → 8px 넘게 내려가면 캡처 → 인라인 transform으로 추종
  //   → 릴리스에서 임계 비교 후 닫기/스냅백. 드래그 중에는 트랜지션을 끈다.
  const panelRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{ y: number; x: number; t: number; active: boolean } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  // 패널 높이는 드래그 시작 시 한 번 재서 상태로 들고 있는다
  // (렌더 중 ref를 읽으면 값이 최신이 아닐 수 있어 리액트가 금지한다)
  const [panelHeight, setPanelHeight] = useState(0);

  function handlePointerDown(e: React.PointerEvent) {
    // 손잡이/헤더에서 시작했거나, 본문이 맨 위일 때만 드래그를 허용한다.
    // (본문을 스크롤하던 중 아래로 끌면 시트가 아니라 내용이 움직여야 한다)
    const fromGrab = !!(e.target as HTMLElement).closest("[data-sheet-grab]");
    const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
    setPanelHeight(panelRef.current?.offsetHeight ?? 0);
    gesture.current = {
      y: e.clientY,
      x: e.clientX,
      t: performance.now(),
      active: fromGrab || atTop,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g?.active) return;
    const dy = e.clientY - g.y;
    const dx = e.clientX - g.x;

    if (!dragging) {
      if (dy > DRAG_START_PX && dy > Math.abs(dx)) {
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* 합성 포인터 등에선 무시 */
        }
      } else if (Math.abs(dx) > DRAG_START_PX || dy < -DRAG_START_PX) {
        g.active = false; // 가로 제스처·위로 끌기엔 시트가 관여하지 않는다
        return;
      } else {
        return;
      }
    }
    setDragY(Math.max(0, dy));
  }

  function handlePointerEnd(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!dragging) return;
    setDragging(false);

    const dy = Math.max(0, e.clientY - (g?.y ?? 0));
    const elapsed = Math.max(1, performance.now() - (g?.t ?? 0));
    const farEnough = dy > Math.max(DISMISS_PX, panelHeight * DISMISS_RATIO);
    const flicked = dy / elapsed > FLICK_VELOCITY && dy > DRAG_START_PX * 2;

    if (farEnough || flicked) {
      onClose(); // 슬라이드 아웃은 open=false → translateY(100%)가 이어서 처리
    } else {
      setDragY(0); // 스냅백
    }
  }

  if (!rendered) return null;
  // SSR 가드 — 서버 렌더 시 document 없음 (Next 16 App Router에선 client component라 무방하지만 안전망)
  if (typeof document === "undefined") return null;

  // 닫히는 중이면 "내려가 있음"이 우선 — 끌던 위치에서 그대로 이어져 내려간다.
  const transform = !open
    ? "translateY(100%)"
    : dragging || dragY > 0
      ? `translateY(${dragY}px)`
      : shown
        ? "translateY(0)"
        : "translateY(100%)";

  // 배경 딤도 끌린 만큼 옅어진다 — 닫히는 중임을 손가락이 먼저 알 수 있게
  const dimProgress = panelHeight > 0 ? Math.min(1, dragY / panelHeight) : 0;
  const dimOpacity = open && shown ? 1 - dimProgress * 0.9 : 0;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        style={{ opacity: dimOpacity, transitionDuration: `${dragging ? 0 : animMs}ms` }}
        className="absolute inset-0 touch-none overscroll-contain bg-black/40 transition-opacity"
        onClick={onClose}
        aria-label="바텀시트 닫기"
      />

      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{
          transform,
          transitionDuration: `${dragging ? 0 : dragY > 0 ? SNAP_MS : animMs}ms`,
        }}
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto w-full max-w-2xl rounded-t-2xl border border-foreground/10 bg-background px-4 pb-4 pt-3 shadow-2xl",
          "transition-transform ease-out"
        )}
      >
        {/* 손잡이 — 보이는 크기는 그대로 두고 위아래 패딩으로 잡기 쉽게.
            여기서 시작하면 본문 스크롤 위치와 무관하게 끌 수 있다. */}
        <div data-sheet-grab className="-mt-3 cursor-grab touch-none py-3 active:cursor-grabbing">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-foreground/20" />
        </div>
        {!hideHeader && (
          <div data-sheet-grab className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">{title ?? "상세"}</h3>
            {headerAction ?? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-[36px] items-center rounded-md border border-foreground/20 px-2.5 text-xs transition-colors hover:bg-foreground/5"
              >
                닫기
              </button>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          className={cn("overflow-y-auto pb-2", size === "large" ? "max-h-[85vh]" : "max-h-[60vh]")}
        >
          {children}
        </div>
        {footer ? <div className="mt-3">{footer}</div> : null}
      </section>
    </div>,
    document.body
  );
}
