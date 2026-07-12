"use client";

// 일기 본문 마크다운 WYSIWYG 에디터 (TipTap).
//
// 마크다운 단축키(입력 즉시 서식 변환)는 각 확장에 내장된 input rule로 동작:
//   # ## ###           → 헤딩
//   **굵게**            → 굵게
//   *기울임* / _기울임_ → 기울임
//   - / *  + space      → 글머리 리스트
//   1. + space          → 번호 매기기
//   > + space           → 인용구
//   --- + enter         → 구분선
//   - [ ] + space       → 클릭 가능한 체크박스 (TaskList/TaskItem)
//
// 컬러: 하늘색 미사용. 앱 기존 블랙 계열 토큰(foreground)만 사용.
// 본문 폰트: 작성화면 스크린샷 기준 17px.

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

interface MarkdownEditorProps {
  /** 초기 HTML (편집 모드). 작성 모드는 빈 문자열. */
  initialContent?: string;
  /** 본문 변경 시 상위로 HTML + 순수 텍스트 전달 */
  onChange: (html: string, text: string) => void;
}

// .ProseMirror 하위 요소 스타일 — 전부 앱 토큰(foreground) 기반, sky/blue 없음.
const EDITOR_WRAPPER_CLASS = [
  "[&_.ProseMirror]:min-h-[55vh] [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-foreground",
  // 문단 — 스크린샷 매칭 17px
  "[&_.ProseMirror_p]:text-[17px] [&_.ProseMirror_p]:leading-[1.7] [&_.ProseMirror_p]:my-1",
  // 헤딩
  "[&_.ProseMirror_h1]:text-[26px] [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mt-3 [&_.ProseMirror_h1]:mb-1",
  "[&_.ProseMirror_h2]:text-[22px] [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-1",
  "[&_.ProseMirror_h3]:text-[19px] [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1",
  // 리스트
  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
  "[&_.ProseMirror_li]:text-[17px] [&_.ProseMirror_li]:leading-[1.7]",
  // 인용구
  "[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-foreground/25 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-foreground/70",
  // 구분선
  "[&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-t [&_.ProseMirror_hr]:border-foreground/15",
  // 코드
  "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-foreground/10 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-[15px]",
  // 체크리스트
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2",
  "[&_li[data-type=taskItem]>label]:mt-1.5 [&_li[data-type=taskItem]>label]:shrink-0",
  "[&_li[data-type=taskItem]>label_input]:h-4 [&_li[data-type=taskItem]>label_input]:w-4 [&_li[data-type=taskItem]>label_input]:accent-foreground",
  "[&_li[data-type=taskItem]>div]:flex-1",
  "[&_li[data-type=taskItem][data-checked=true]>div]:text-foreground/40 [&_li[data-type=taskItem][data-checked=true]>div]:line-through",
].join(" ");

export function MarkdownEditor({ initialContent = "", onChange }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: initialContent,
    autofocus: "end",
    // SSR hydration mismatch 방지 (Next.js App Router)
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-none",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
    },
  });

  return (
    <div className={EDITOR_WRAPPER_CLASS}>
      <EditorContent editor={editor} />
    </div>
  );
}
