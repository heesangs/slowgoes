import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
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
    "AI가 난이도를 분석하고 시간을 제안합니다. 최종 결정은 당신의 몫.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldLoadFigmaCapture = process.env.NODE_ENV === "development";

  return (
    <html lang="ko">
      <head>
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
