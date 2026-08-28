"use client";

// 회원가입 페이지

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/app/(auth)/actions";
import Link from "next/link";
import { APP } from "@/lib/constants/brand";
import { useState } from "react";
import { DemoDataBanner } from "@/components/auth/demo-data-banner";
import { FORM_WIDTH } from "@/lib/constants/layout";
import { cn } from "@/lib/utils";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm_password") as string;

    // 클라이언트 검증
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUpAction(formData);
      if (result?.error) {
        setError(result.error);
      }
      // 성공 시 signUpAction이 redirect를 throw하므로 여기에 도달하지 않음
    } catch {
      // redirect는 에러로 throw되므로 무시
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("mx-auto w-full", FORM_WIDTH)}>
      <div>
        {/* 로그인(Figma 37594:83755)과 같은 구성 — 화면 이름 + 핵심 가치 한 줄 */}
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-bold text-label-neutral">signup</h1>
          <p className="text-base text-label-neutral">{APP.TAGLINE}</p>
        </div>

        <DemoDataBanner />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="email"
            name="email"
            type="email"
            label="이메일"
            placeholder="example@email.com"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            id="password"
            name="password"
            type="password"
            label="비밀번호"
            placeholder="6자 이상 입력하세요"
            required
            autoComplete="new-password"
            minLength={6}
          />

          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            label="비밀번호 확인"
            placeholder="비밀번호를 다시 입력하세요"
            required
            autoComplete="new-password"
          />

          {error && (
            <p className="text-sm text-danger text-center">{error}</p>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full mt-2">
            회원가입
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-label-alt">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-bold text-label-normal hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
