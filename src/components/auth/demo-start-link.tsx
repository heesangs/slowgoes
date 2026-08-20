"use client";

// 랜딩의 "로그인 없이 체험해보기" 링크.
//
// 누르는 순간 지난 체험 기록을 버린다 — 랜딩에서 들어오는 건 언제나 "처음부터"다.
// (체험 도중 이탈했다가 뒤로가기로 돌아오는 경우에만 이어서 보여준다.)
//
// 쿼리(?restart=1)로 신호를 주는 방법은 쓰지 않는다: URL을 지우려고 replaceState를
// 하면 브라우저 주소만 바뀌고 Next 라우터 캐시에는 restart 페이로드가 남아, 나중에
// 뒤로가기로 돌아왔을 때 그게 재사용되며 진행 상황을 또 지워 버린다.

import Link from "next/link";
import { DEMO_DRAFT_SESSION_KEY } from "@/components/auth/onboarding/constants";

export function DemoStartLink({ className }: { className?: string }) {
  return (
    <Link
      href="/demo"
      className={className}
      onClick={() => {
        try {
          sessionStorage.removeItem(DEMO_DRAFT_SESSION_KEY);
        } catch {
          // sessionStorage 접근 불가 시 무시 — 최악이라도 이어서 보일 뿐이다
        }
      }}
    >
      로그인 없이 체험해보기 →
    </Link>
  );
}
