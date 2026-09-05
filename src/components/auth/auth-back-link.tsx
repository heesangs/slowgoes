// 로그인·회원가입 화면의 좌상단 ‹ — 첫 화면으로 나간다.
//
// 왜 필요한가: 이 앱은 PWA `display: "standalone"` 이라 홈 화면에서 열면 **브라우저
// 뒤로가기 버튼이 아예 없다.** 랜딩 리디자인 때 인증 화면의 slowgoes 홈 링크를
// Figma(37594:83755)에 맞춰 뺐는데, 그러면서 두 화면에 이탈 수단이 하나도 남지 않았다.
// 특히 랜딩에만 있는 "체험해보기"(/demo)로 되돌아갈 길이 끊긴다.
// /demo 온보딩 Step 1도 같은 이유로 이미 ‹ 를 갖고 있다(onboarding-form.tsx).
//
// 목적지를 router.back()이 아니라 "/" 로 고정하는 이유: 회원가입은 랜딩에서 바로 오기도
// 하고 로그인에서 넘어오기도 하는데, 새로고침하거나 링크로 직행하면 back()이 돌아갈
// 곳을 잃어 다시 갇힌다. 로그인↔회원가입은 각 화면 하단 링크가 이미 이어 준다.
//
// 배치: 인증 셸(app/(auth)/layout.tsx)이 콘텐츠를 세로 가운데 정렬하므로, 흐름 안에 두면
// ‹ 도 화면 한가운데로 따라간다. 뷰포트 기준 fixed 로 띄워 좌상단에 고정한다.
// left-1(4px) + 버튼 44px 안에서 아이콘이 12px 들여쓰기 → 아이콘 왼쪽이 화면에서 16px,
// 앱 공통 좌우 여백(px-4)과 맞는다.

import Link from "next/link";
import { BackIcon } from "@/components/ui/icons";

export function AuthBackLink() {
  return (
    <Link
      href="/"
      aria-label="첫 화면으로"
      className="fixed left-1 top-[calc(0.25rem+env(safe-area-inset-top))] z-10 inline-flex h-11 w-11 items-center justify-center rounded-lg text-label-normal transition-colors hover:bg-fill-alt active:bg-fill-normal"
    >
      <BackIcon className="h-5 w-5" />
    </Link>
  );
}
