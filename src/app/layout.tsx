import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "slowgoes - 나의 속도로, 천천히",
  description:
    "내 속도에 맞게 삶의 목표를 실행가능한 리듬으로 바꾼다",
  // 홈 화면 앱(iOS) — app/manifest.ts와 짝. 구 iOS는 매니페스트를 보지 않고
  // 이 메타만 보므로 둘 다 둔다. capable:true → apple-mobile-web-app-capable
  appleWebApp: {
    capable: true,
    title: "slowgoes",
    // default: 상태바가 별도 영역으로 남는다(콘텐츠가 노치 밑으로 들어가지 않음)
    statusBarStyle: "default",
  },
  other: {
    // Next 16은 appleWebApp.capable에 대해 표준 키(mobile-web-app-capable)만 내보낸다.
    // iOS 17 이하는 apple- 접두 키만 인식하므로 직접 넣어 둘 다 만족시킨다.
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
};

// maximumScale: 1 — iOS Safari의 인풋 포커스 자동 확대 억제.
// iOS는 이 설정에서도 사용자 핀치줌은 계속 허용하므로 접근성 훼손 없음.
// viewportFit: cover — 이게 있어야 env(safe-area-inset-*)가 실제 값을 갖는다.
// 바텀 네비/FAB/토스트가 iOS 홈 인디케이터를 피하려면 필요.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // 홈 화면 앱(크롬 없음)에서 상태바 주변 색이 배경과 어긋나지 않게.
  // 앱 테마 토큰과 같은 값(라이트 #ffffff / 다크 #333333).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#333333" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldLoadFigmaCapture = process.env.NODE_ENV === "development";

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 페인트 전 테마 적용 — FOUC(테마 깜빡임) 방지 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
        {shouldLoadFigmaCapture && (
          <script
            src="https://mcp.figma.com/mcp/html-to-design/capture.js"
            async
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
