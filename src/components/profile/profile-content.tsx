"use client";

// 프로필 페이지 전체 UI — 기본 정보 수정 + 계정 관리

import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  updateProfileAction,
  changePasswordAction,
  deleteAccountAction,
} from "@/app/(main)/profile/actions";
import { signOutAction } from "@/app/(auth)/actions";
import { TaskStatsSection } from "@/components/profile/task-stats";
import { ThemeSetting } from "@/components/profile/theme-setting";
import { ACCOUNT_DELETE_CONFIRM_TEXT } from "@/lib/constants";
import type { TaskStats } from "@/types";

interface ProfileViewData {
  id: string;
  display_name: string | null;
  created_at: string;
}

interface ProfileContentProps {
  profile: ProfileViewData;
  email: string;
  stats: TaskStats;
}

export function ProfileContent({ profile, email, stats }: ProfileContentProps) {
  const { toast } = useToast();

  // 프로필 폼 상태
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [isProfileSaving, setIsProfileSaving] = useState(false);

  // 비밀번호 변경 상태
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  // 로그아웃 상태
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // 함께한 일수 계산
  const daysSinceJoined = Math.max(
    1,
    Math.floor(
      (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
  );

  async function handleProfileSave() {
    if (!displayName.trim()) {
      toast("닉네임을 입력해주세요.", "error");
      return;
    }

    setIsProfileSaving(true);
    try {
      const formData = new FormData();
      formData.set("display_name", displayName.trim());

      const result = await updateProfileAction(formData);
      if (result.success) {
        toast("프로필이 저장되었습니다.");
      } else {
        toast(result.error ?? "저장에 실패했습니다.", "error");
      }
    } catch {
      toast("저장 중 오류가 발생했습니다.", "error");
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (!newPassword || !confirmPassword) {
      toast("비밀번호를 입력해주세요.", "error");
      return;
    }
    if (newPassword.length < 6) {
      toast("비밀번호는 최소 6자 이상이어야 합니다.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("비밀번호가 일치하지 않습니다.", "error");
      return;
    }

    setIsPasswordSaving(true);
    try {
      const formData = new FormData();
      formData.set("new_password", newPassword);
      formData.set("confirm_password", confirmPassword);

      const result = await changePasswordAction(formData);
      if (result.success) {
        toast("비밀번호가 변경되었습니다.");
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordForm(false);
      } else {
        toast(result.error ?? "변경에 실패했습니다.", "error");
      }
    } catch {
      toast("비밀번호 변경 중 오류가 발생했습니다.", "error");
    } finally {
      setIsPasswordSaving(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOutAction();
    } catch {
      // redirect는 에러로 throw되므로 무시
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) {
      toast("비밀번호를 입력해주세요.", "error");
      return;
    }

    if (deleteConfirmText !== ACCOUNT_DELETE_CONFIRM_TEXT) {
      toast(`확인 문구를 정확히 입력해주세요. (${ACCOUNT_DELETE_CONFIRM_TEXT})`, "error");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const formData = new FormData();
      formData.set("password", deletePassword);
      formData.set("confirm_text", deleteConfirmText);

      const result = await deleteAccountAction(formData);
      if (!result.success) {
        toast(result.error ?? "회원탈퇴에 실패했습니다.", "error");
      }
    } catch {
      // redirect는 에러로 throw되므로 무시
    } finally {
      setIsDeletingAccount(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background text-xl font-bold shrink-0">
          {(displayName || "?")[0]}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{displayName || "이름 없음"}</h1>
          <p className="text-sm text-foreground/60">slowgoes과 함께한 지 {daysSinceJoined}일째</p>
        </div>
      </div>

      {/* Section 1: 기본 정보 */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">기본 정보</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Input
            id="display_name"
            label="닉네임"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="닉네임을 입력하세요"
            maxLength={10}
          />

          <Button
            onClick={handleProfileSave}
            isLoading={isProfileSaving}
            className="w-full"
          >
            저장하기
          </Button>
        </CardContent>
      </Card>

      {/* Section: 화면 테마 */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">화면 테마</h2>
        </CardHeader>
        <CardContent>
          <ThemeSetting />
        </CardContent>
      </Card>

      {/* Section 2: 통계 */}
      <TaskStatsSection stats={stats} />

      {/* Section 3: 계정 관리 */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">계정 관리</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* 이메일 (읽기 전용) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground/70">이메일</label>
            <p className="rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-3 text-sm text-foreground/60">
              {email}
            </p>
          </div>

          {/* 비밀번호 변경 */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowPasswordForm((prev) => !prev)}
              className="flex items-center justify-between rounded-lg border border-foreground/20 px-4 py-3 text-sm font-medium transition-colors hover:bg-foreground/5 cursor-pointer"
            >
              <span>비밀번호 변경</span>
              <svg
                className={`h-4 w-4 transition-transform ${showPasswordForm ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showPasswordForm && (
              <div className="flex flex-col gap-3 rounded-lg border border-foreground/10 p-4">
                <Input
                  id="new_password"
                  label="새 비밀번호"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6자 이상 입력"
                  autoComplete="new-password"
                />
                <Input
                  id="confirm_password"
                  label="비밀번호 확인"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 다시 입력"
                  autoComplete="new-password"
                />
                <Button
                  onClick={handlePasswordChange}
                  isLoading={isPasswordSaving}
                  className="w-full"
                >
                  비밀번호 변경
                </Button>
              </div>
            )}
          </div>

          {/* 로그아웃 */}
          <Button
            variant="secondary"
            onClick={handleSignOut}
            isLoading={isSigningOut}
            className="w-full"
          >
            로그아웃
          </Button>

          {/* 회원탈퇴 */}
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-red-600">회원탈퇴</p>
              <p className="text-xs text-red-700/90">
                회원탈퇴 시 프로필, 할 일, 세부 단계 등 계정 데이터가 즉시 영구 삭제되며 복구할 수
                없습니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowDeleteForm((prev) => !prev)}
              className="mt-3 w-full rounded-lg border border-red-500/40 bg-background px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 cursor-pointer"
            >
              {showDeleteForm ? "탈퇴 폼 닫기" : "회원탈퇴 진행"}
            </button>

            {showDeleteForm && (
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-red-500/20 bg-background p-3">
                <Input
                  id="delete_password"
                  label="비밀번호 재입력"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="현재 비밀번호 입력"
                  autoComplete="current-password"
                />
                <Input
                  id="delete_confirm_text"
                  label={`확인 문구 (${ACCOUNT_DELETE_CONFIRM_TEXT})`}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={ACCOUNT_DELETE_CONFIRM_TEXT}
                  autoComplete="off"
                />
                <Button
                  onClick={handleDeleteAccount}
                  isLoading={isDeletingAccount}
                  disabled={
                    !deletePassword ||
                    deleteConfirmText !== ACCOUNT_DELETE_CONFIRM_TEXT
                  }
                  className="w-full bg-red-600 text-white hover:bg-red-700 active:bg-red-800"
                >
                  영구 삭제 후 탈퇴
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
