import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 클라이언트 Router Cache 재사용 시간.
    // 얇은 페이지(auth-only) 셸 RSC를 <Link> 재방문 시 재사용 → 전환 시 RSC 왕복 제거.
    // 데이터는 React Query가 캐싱하므로 두 레이어가 겹치지 않고 층을 이룬다.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // 배럴 import를 실제 쓰는 모듈만 남기도록 정리 — TipTap은 확장이 많아 효과가 크다.
    // (덩어리 자체는 markdown-editor-lazy의 next/dynamic이 라우트 초기 번들에서 떼어낸다)
    optimizePackageImports: ["@tiptap/react", "@tiptap/starter-kit"],
  },
};

export default nextConfig;
