"use client";

// 로그아웃 버튼 컴포넌트

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(auth)/actions";
import { useState } from "react";

export function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignOut() {
    setIsLoading(true);
    try {
      await signOutAction();
    } catch {
      // redirect는 에러로 throw되므로 무시
    }
  }

  return (
    <Button
      variant="text"
      size="sm"
      isLoading={isLoading}
      onClick={handleSignOut}
    >
      로그아웃
    </Button>
  );
}
