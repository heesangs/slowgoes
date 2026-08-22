// (auth) 공통 셸 — 로그인 · 회원가입 · 온보딩이 공유한다.
//
// 예전엔 세 페이지가 `flex min-h-dvh items-center justify-center px-4`를 각자 복제했고
// 패딩(py-8 유무)과 폭도 조금씩 어긋났다. 여기로 모아 한 곳에서 정한다.
//
// safe-area: (main) 그룹은 MainShell이 헤더·본문에서 흡수하지만 여기는 그런 크롬이 없다.
//   홈 화면 앱(standalone + viewport-fit=cover)에서 상태바·홈 인디케이터에 콘텐츠가
//   겹치지 않도록 셸이 직접 더한다.
//
// 세로 정렬: 자식에 `m-auto`를 준다. `justify-center`만 쓰면 콘텐츠가 화면보다 길 때
//   **위쪽이 스크롤 밖으로 잘려** 접근할 수 없게 되는데, auto 마진은 넘칠 때 start로
//   자연스럽게 폴백한다.

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-dvh px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]"
    >
      <div className="m-auto w-full">{children}</div>
    </div>
  );
}
