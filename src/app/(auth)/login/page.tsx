"use client";

// 로그인 페이지

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/app/(auth)/actions";
import Link from "next/link";
import { APP } from "@/lib/constants/brand";
import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { FORM_WIDTH } from "@/lib/constants/layout";
import { cn } from "@/lib/utils";

const SAVED_EMAIL_KEY = "slowgoes_saved_email";

function isNextRedirectError(error: unknown): error is Error & { digest: string } {
  if (typeof error !== "object" || error === null) return false;
  if (!("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

type BannerTone = "info" | "warn" | "error";

const VERIFY_BANNERS: Record<string, { message: string; tone: BannerTone }> = {
  pending: {
    message: "인증 메일을 보냈어요. 메일함(스팸함 포함)을 확인한 후 로그인해주세요.",
    tone: "info",
  },
  existing: {
    message: "이미 가입된 이메일이에요. 로그인하거나 비밀번호 재설정을 이용해주세요.",
    tone: "warn",
  },
  error: {
    message: "이메일 인증에 실패했어요. 다시 시도해주세요.",
    tone: "error",
  },
  complete: {
    message: "이메일 인증이 완료되었어요! 로그인해주세요.",
    tone: "info",
  },
};

function buildPendingMessage(email: string | null) {
  if (!email) return VERIFY_BANNERS.pending.message;
  return `인증 메일을 ${email}로 보냈어요. 메일함(스팸함 포함)을 확인한 후 로그인해주세요.`;
}

function VerifyBanner() {
  const searchParams = useSearchParams();
  const verifyStatus = searchParams.get("verify");
  const verifyEmail = searchParams.get("email");

  const banner = useMemo(() => {
    if (!verifyStatus) return null;
    const base = VERIFY_BANNERS[verifyStatus] ?? null;
    if (!base) return null;
    if (verifyStatus === "pending") {
      return {
        ...base,
        message: buildPendingMessage(verifyEmail),
      };
    }
    return base;
  }, [verifyStatus, verifyEmail]);

  if (!banner) return null;

  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        banner.tone === "error"
          ? "border-danger/30 bg-danger/5 text-danger"
          : banner.tone === "warn"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-success/30 bg-success/10 text-success"
      }`}
    >
      {banner.message}
    </div>
  );
}

export default function LoginPage() {
  // 저장해 둔 이메일은 **브라우저에만** 있다. 첫 렌더에서 읽으면 서버가 그린 HTML(빈 값)과
  // 어긋나는데, 값이 있으면 Input이 ✕ 지움 버튼까지 그리므로 속성이 아니라 **DOM 트리**가
  // 달라진다 → React가 "Hydration failed"로 끊고 그 트리를 통째로 다시 그린다.
  // 그래서 빈 값으로 시작하고 마운트 뒤에 채운다(아래 useEffect).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 이메일 형식 정규식 검증 (onBlur 시 호출)
  function handleEmailBlur() {
    if (!email) {
      setEmailError(null);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("올바른 이메일 형식을 입력해주세요");
    } else {
      setEmailError(null);
    }
  }

  // 마운트 뒤 1회 — 저장해 둔 이메일 복원.
  // 하이드레이션이 끝난 다음이라 서버 HTML과 어긋날 일이 없다(위 useState 주석 참고).
  // 회원가입 쪽 DemoDataBanner도 같은 이유로 같은 방식을 쓴다.
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  // 이메일 변경 시 localStorage에 저장
  useEffect(() => {
    if (email) {
      localStorage.setItem(SAVED_EMAIL_KEY, email);
    }
  }, [email]);

  async function handleSubmit() {
    setError(null);
    setIsLoading(true);

    // controlled 상태값으로 FormData 생성
    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    try {
      const result = await signInAction(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setError("로그인 처리 중 문제가 발생했습니다. 다시 시도해주세요.");
      }
      setIsLoading(false);
    } catch (error) {
      // redirect 에러는 Next.js가 라우팅을 처리하도록 그대로 전달
      if (isNextRedirectError(error)) {
        throw error;
      }
      setError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("mx-auto w-full", FORM_WIDTH)}>
      <div>
        {/* Figma 37594:83755 — 화면 이름이 제목이고 그 아래 핵심 가치 한 줄 */}
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-bold text-label-neutral">login</h1>
          <p className="text-base text-label-neutral">{APP.TAGLINE}</p>
        </div>

        <Suspense>
          <VerifyBanner />
        </Suspense>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            id="email"
            name="email"
            type="email"
            label="이메일"
            placeholder="example@email.com"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // 입력 중에는 에러 클리어
              if (emailError) setEmailError(null);
            }}
            onBlur={handleEmailBlur}
            onClear={() => {
              setEmail("");
              setEmailError(null);
              localStorage.removeItem(SAVED_EMAIL_KEY);
            }}
            error={emailError ?? undefined}
          />

          <Input
            id="password"
            name="password"
            type="password"
            label="비밀번호"
            placeholder="비밀번호를 입력하세요"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onClear={() => setPassword("")}
          />

          {error && (
            <p className="text-sm text-danger text-center">{error}</p>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full mt-2">
            로그인
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-label-alt">
          아직 계정이 없으신가요?{" "}
          <Link href="/signup" className="font-bold text-label-normal hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
