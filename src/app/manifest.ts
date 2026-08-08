import type { MetadataRoute } from "next";
import { APP } from "@/lib/constants";

// 웹 앱 매니페스트 — 홈 화면에 추가한 아이콘이 **브라우저 크롬 없이** 열리게 한다.
//
// 왜 필요한가: 매니페스트가 없으면 iOS가 "홈 화면에 추가한 그 순간의 URL"로 스코프를
// 추측한다. /dashboard에서 추가했다면 iOS 17.4+ 는 /diary·/review를 스코프 밖으로 보고
// 상·하단 바가 달린 인앱 브라우저로 연다("일기로 넘어가면 브라우저 창이 생긴다").
// scope를 "/"로 못 박으면 추측할 여지가 사라진다.
//
// ⚠️ 적용하려면 기기에서 홈 화면 아이콘을 **지우고 다시 추가**해야 한다 —
//    iOS는 추가하는 시점의 설정을 캐시한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP.NAME} - 나의 속도로, 천천히`,
    short_name: APP.NAME,
    description: "내 속도에 맞게 삶의 목표를 실행가능한 리듬으로 바꾼다",
    // 아이콘을 눌렀을 때 여는 화면. 랜딩(/)이 아니라 바로 대시보드로.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ko",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
