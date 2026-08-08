import { ImageResponse } from "next/og";

// iOS 홈 화면 아이콘 — apple-touch-icon은 PNG만 받는다(매니페스트의 SVG를 쓰지 않는다).
// 바이너리 파일을 리포에 넣는 대신 ImageResponse로 빌드 시 생성한다.
// 없으면 iOS가 페이지 스크린샷을 아이콘으로 쓴다.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      // public/icon.svg와 같은 모티프(24시간 다이얼) — 180px 기준으로 축소 재구성
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#333333",
          position: "relative",
        }}
      >
        {/* 0시 / 12시 강조점 */}
        <div style={{ position: "absolute", top: 38, width: 10, height: 10, borderRadius: 5, background: "#fff" }} />
        <div style={{ position: "absolute", bottom: 38, width: 10, height: 10, borderRadius: 5, background: "#fff" }} />
        {/* 시침(위) / 분침(우하) */}
        <div style={{ position: "absolute", top: 62, width: 7, height: 30, borderRadius: 4, background: "#fff" }} />
        <div
          style={{
            position: "absolute",
            top: 88,
            left: 90,
            width: 5,
            height: 32,
            borderRadius: 3,
            background: "#fff",
            transform: "rotate(-125deg)",
            transformOrigin: "top center",
          }}
        />
      </div>
    ),
    size
  );
}
