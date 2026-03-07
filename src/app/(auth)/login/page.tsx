"use client";

// 로그인 페이지

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/app/(auth)/actions";
import Link from "next/link";
import { useEffect, useState } from "react";

const SAVED_EMAIL_KEY = "slowgoes_saved_email";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 마운트 시 저장된 이메일 불러오기
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
      // signInAction은 성공 시 redirect하므로 여기 도달하면 에러
      if (result?.error) {
        setError(result.error);
      }
    } catch {
      // redirect는 에러로 throw되므로 무시
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">slowgoes</h1>
          <p className="text-sm text-foreground/60">
            나의 속도로, 천천히 확실하게
          </p>
        </div>

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
            onChange={(e) => setEmail(e.target.value)}
            onClear={() => {
              setEmail("");
              localStorage.removeItem(SAVED_EMAIL_KEY);
            }}
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
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full mt-2">
            로그인
          </Button>
        </form>

        <p className="text-sm text-foreground/60 text-center mt-6">
          아직 계정이 없으신가요?{" "}
          <Link href="/signup" className="text-foreground font-medium hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
