"use client";

// MarkdownEditor 지연 로딩 래퍼.
//
// TipTap + ProseMirror(StarterKit 확장 포함)는 일기 화면에서만 쓰는 큰 덩어리인데,
// 정적 import라 /diary/new · /diary/[id] 라우트의 **초기 클라이언트 번들**에 통째로
// 들어갔다. 그래서 카드를 눌러 진입하는 순간 그 청크를 받을 때까지 화면이 비었다.
//   → next/dynamic으로 잘라내고(ssr:false — 어차피 클라이언트 전용),
//     들어가기 전에 preloadMarkdownEditor()로 미리 받아 둔다(주간 시트·일기 목록).
// 미리 받아 뒀다면 진입 시 스켈레톤이 뜰 새도 없이 바로 에디터가 뜬다.

import dynamic from "next/dynamic";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";

const SKELETON = "rounded bg-foreground/10";

/** 청크가 늦게 올 때만(300ms 초과) 보이는 본문 스켈레톤 — loading.tsx 대신 지연 플래그 */
function EditorBodySkeleton() {
  const show = useDelayedFlag(true);
  if (!show) return <div className="min-h-[55vh]" />;
  return (
    <div className="min-h-[55vh] animate-pulse" aria-label="편집기 로딩 중">
      <div className="flex flex-col gap-2">
        <div className={`${SKELETON} h-4 w-1/2`} />
        <div className={`${SKELETON} h-4 w-11/12`} />
        <div className={`${SKELETON} h-4 w-4/5`} />
      </div>
    </div>
  );
}

export const MarkdownEditor = dynamic(
  () => import("./markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <EditorBodySkeleton /> }
);

/**
 * 에디터 청크 미리받기 — 일기로 들어갈 만한 화면에서 호출한다.
 * import()는 모듈 그래프가 같아 중복 요청이 되지 않고, 받아 둔 청크는 브라우저 캐시에 남는다.
 */
export function preloadMarkdownEditor() {
  void import("./markdown-editor");
}
