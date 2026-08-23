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

import { memo } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

interface MarkdownEditorProps {
  /** 초기 HTML (편집 모드). 작성 모드는 빈 문자열. */
  initialContent?: string;
  /** 본문 변경 시 상위로 HTML + 순수 텍스트 전달 */
  onChange: (html: string, text: string) => void;
  /**
   * 생성 직후 editor 인스턴스 전달 — 상위가 프로그램적으로 내용을 넣을 때 쓴다
   * (예: AI 주간 목표를 체크박스 목록으로 삽입).
   * memo 유지를 위해 **useCallback으로 안정화한 함수**를 넘길 것.
   */
  onReady?: (editor: Editor) => void;
}

// .ProseMirror 하위 요소 스타일 — 전부 앱 토큰(foreground) 기반, sky/blue 없음.
const EDITOR_WRAPPER_CLASS = [
  "[&_.ProseMirror]:min-h-[55vh] [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-label-normal",
  // 문단 — 14px, 자동 줄바꿈 1.5. 엔터(문단) 간격은 +7px로 2.0 리듬(14×1.5=21 + 7 = 28 ≈ 2.0×14)
  "[&_.ProseMirror_p]:text-[14px] [&_.ProseMirror_p]:leading-[1.5] [&_.ProseMirror_p]:mt-0 [&_.ProseMirror_p]:mb-[7px]",
  // 헤딩 — 반전(오름차순): # 은 본문크기+볼드, ## 더 크게, ### 가장 크게
  "[&_.ProseMirror_h1]:text-[14px] [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mt-3 [&_.ProseMirror_h1]:mb-1",
  "[&_.ProseMirror_h2]:text-[18px] [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-1",
  "[&_.ProseMirror_h3]:text-[22px] [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:mb-1",
  // 리스트
  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
  "[&_.ProseMirror_li]:text-[14px] [&_.ProseMirror_li]:leading-[1.5]",
  // 인용구
  "[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-foreground/25 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-label-alt",
  // 구분선
  "[&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-t [&_.ProseMirror_hr]:border-foreground/15",
  // 코드
  "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-foreground/10 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-[13px]",
  // 체크리스트 — 항목은 li[data-checked]로 잡는다.
  // (TipTap이 내보내는 마크업은 `<ul data-type="taskList"><li data-checked="false">`로,
  //  li에는 data-type이 붙지 않는다. taskItem으로 걸면 아무것도 매칭되지 않아
  //  체크박스가 텍스트 위로 떨어진다.)
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2",
  "[&_ul[data-type=taskList]_li>label]:mt-1 [&_ul[data-type=taskList]_li>label]:shrink-0",
  "[&_ul[data-type=taskList]_li>label_input]:h-4 [&_ul[data-type=taskList]_li>label_input]:w-4 [&_ul[data-type=taskList]_li>label_input]:accent-foreground",
  "[&_ul[data-type=taskList]_li>div]:flex-1",
  "[&_ul[data-type=taskList]_li[data-checked=true]>div]:text-label-disable [&_ul[data-type=taskList]_li[data-checked=true]>div]:line-through",
].join(" ");

// React.memo — 부모(DiaryEditor)가 저장 상태 표시로 리렌더돼도 에디터 서브트리는
// 리렌더하지 않는다. 특히 한글 IME 조합 중 EditorContent 리렌더는 캐럿을 튀게 하므로,
// onChange를 안정 참조(useCallback)로 받아 memo가 유지되게 하는 것이 중요하다.
function MarkdownEditorImpl({ initialContent = "", onChange, onReady }: MarkdownEditorProps) {
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
    // 에디터 생성 직후 텍스트 포커스 (키보드 오픈이 아닌 커서 배치가 목적)
    onCreate: ({ editor }) => {
      editor.commands.focus("end");
      onReady?.(editor);
    },
    editorProps: {
      attributes: {
        class: "prose-none",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
    },
  });

  // 최초 포커스는 onCreate에서 1회 처리한다. 이전엔 useEffect([editor])로 다시 focus("end")를
  // 호출했는데, 입력 중 재실행될 여지가 있어 캐럿이 문서 끝으로 튀는 원인이 될 수 있었다 → 제거.

  return (
    <div className={EDITOR_WRAPPER_CLASS}>
      <EditorContent editor={editor} />
    </div>
  );
}

// initialContent는 마운트 시 1회만 쓰이고, onChange는 부모가 useCallback으로 안정화하므로
// 얕은 비교 memo로 충분하다(부모 리렌더 시 에디터 리렌더 skip).
export const MarkdownEditor = memo(MarkdownEditorImpl);
