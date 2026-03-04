"use client";

// 온보딩 폼 — 4단계 멀티스텝: 닉네임 → 사용 목적 → 세부 설정 → 나의 속도

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProfileAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { UserContext } from "@/types";

// Step 2: 사용 목적 선택지
const USER_CONTEXTS = [
  { value: "student" as UserContext, label: "🎒 학교 공부" },
  { value: "university" as UserContext, label: "🎓 대학 과제·시험" },
  { value: "work" as UserContext, label: "💼 업무·프로젝트" },
  { value: "personal" as UserContext, label: "📚 자기계발·취미" },
] as const;

// Step 3: 컨텍스트별 세부 필드
const STUDENT_GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"];
const STUDENT_SUBJECTS = ["국어", "영어", "수학", "과학", "사회", "기타"];

const UNI_GRADES = ["1학년", "2학년", "3학년", "4학년", "대학원"];
const UNI_SUBJECTS = [
  "인문", "사회", "경영", "공학", "자연과학", "예체능", "의약", "교육", "기타",
];

const WORK_SUBJECTS = [
  "개발", "디자인", "마케팅", "기획", "영업", "연구", "관리", "기타",
];

const PERSONAL_SUBJECTS = ["독서", "운동", "어학", "자격증", "창작", "기타"];

// Step 4: 나의 속도
const SELF_LEVELS = [
  { value: "low", label: "느긋한 편", description: "천천히, 꼼꼼하게" },
  { value: "medium", label: "보통", description: "적당한 속도로" },
  { value: "high", label: "빠른 편", description: "빠르게, 효율적으로" },
] as const;

export function OnboardingForm() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1
  const [displayName, setDisplayName] = useState("");

  // Step 2
  const [userContext, setUserContext] = useState<UserContext[]>([]);

  // Step 3 (세부 설정)
  const [studentGrade, setStudentGrade] = useState("");
  const [studentSubjects, setStudentSubjects] = useState<string[]>([]);
  const [uniGrade, setUniGrade] = useState("");
  const [uniSubjects, setUniSubjects] = useState<string[]>([]);
  const [workSubjects, setWorkSubjects] = useState<string[]>([]);
  const [personalSubjects, setPersonalSubjects] = useState<string[]>([]);

  // Step 4
  const [selfLevel, setSelfLevel] = useState<string>("medium");

  function toggleContext(ctx: UserContext) {
    setUserContext((prev) =>
      prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx]
    );
  }

  function toggleList<T extends string>(
    list: T[],
    setList: React.Dispatch<React.SetStateAction<T[]>>,
    item: T
  ) {
    setList((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  }

  // 최종 grade/subjects 계산
  function computeGradeAndSubjects(): { grade: string; subjects: string[] } {
    let grade = "";
    const subjectsSet = new Set<string>();

    if (userContext.includes("student")) {
      if (studentGrade) grade = studentGrade;
      studentSubjects.forEach((s) => subjectsSet.add(s));
    }
    if (userContext.includes("university")) {
      // 대학은 student보다 우선하지 않음 (첫 번째 선택 우선)
      if (!grade && uniGrade) grade = `대학${uniGrade.replace("학년", "").replace("대학원", "원")}`;
      uniSubjects.forEach((s) => subjectsSet.add(s));
    }
    if (userContext.includes("work")) {
      workSubjects.forEach((s) => subjectsSet.add(s));
    }
    if (userContext.includes("personal")) {
      personalSubjects.forEach((s) => subjectsSet.add(s));
    }

    return { grade, subjects: Array.from(subjectsSet) };
  }

  function handleNext() {
    setError(null);
    if (step === 1) {
      if (!displayName.trim()) {
        setError("닉네임을 입력해주세요.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (userContext.length === 0) {
        setError("하나 이상 선택해주세요.");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  }

  function handleBack() {
    setError(null);
    setStep((prev) => prev - 1);
  }

  async function handleSubmit() {
    setError(null);
    setIsLoading(true);

    try {
      const { grade, subjects } = computeGradeAndSubjects();
      const formData = new FormData();
      formData.set("display_name", displayName.trim());
      formData.set("grade", grade);
      formData.set("subjects", JSON.stringify(subjects));
      formData.set("self_level", selfLevel);
      formData.set("user_context", JSON.stringify(userContext));

      const result = await saveProfileAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    } catch {
      // redirect는 에러로 throw되므로 무시
    } finally {
      setIsLoading(false);
    }
  }

  const stepIndicator = (
    <div className="flex items-center gap-1.5 mb-6">
      {[1, 2, 3, 4].map((s) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all",
            s === step ? "w-6 bg-foreground" : "w-3 bg-foreground/20"
          )}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {stepIndicator}

      {/* Step 1: 닉네임 */}
      {step === 1 && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">반가워요!</h2>
            <p className="text-sm text-foreground/60">닉네임을 알려주세요</p>
          </div>
          <Input
            id="display_name"
            name="display_name"
            label="닉네임"
            placeholder="닉네임을 입력하세요"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            autoFocus
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="button" onClick={handleNext} className="w-full">
            다음
          </Button>
        </div>
      )}

      {/* Step 2: 사용 목적 */}
      {step === 2 && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">어떤 일에 slowgoes를 쓸 예정인가요?</h2>
            <p className="text-sm text-foreground/60">복수 선택 가능해요</p>
          </div>
          <div className="flex flex-col gap-2">
            {USER_CONTEXTS.map((ctx) => (
              <button
                key={ctx.value}
                type="button"
                onClick={() => toggleContext(ctx.value)}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors cursor-pointer",
                  userContext.includes(ctx.value)
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:bg-foreground/5"
                )}
              >
                {ctx.label}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
              이전
            </Button>
            <Button type="button" onClick={handleNext} className="flex-1">
              다음
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: 세부 설정 */}
      {step === 3 && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">조금 더 알려주세요</h2>
            <p className="text-sm text-foreground/60">나중에 언제든 바꿀 수 있어요</p>
          </div>

          {/* 학교 공부 */}
          {userContext.includes("student") && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground/70">학년</label>
                <div className="grid grid-cols-3 gap-2">
                  {STUDENT_GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setStudentGrade(g)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                        studentGrade === g
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/20 hover:bg-foreground/5"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground/70">주요 과목 (복수 선택)</label>
                <div className="grid grid-cols-3 gap-2">
                  {STUDENT_SUBJECTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleList(studentSubjects, setStudentSubjects, s)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                        studentSubjects.includes(s)
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/20 hover:bg-foreground/5"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 대학 과제·시험 */}
          {userContext.includes("university") && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground/70">학년</label>
                <div className="grid grid-cols-3 gap-2">
                  {UNI_GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setUniGrade(g)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                        uniGrade === g
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/20 hover:bg-foreground/5"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground/70">전공 계열 (복수 선택)</label>
                <div className="grid grid-cols-3 gap-2">
                  {UNI_SUBJECTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleList(uniSubjects, setUniSubjects, s)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                        uniSubjects.includes(s)
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/20 hover:bg-foreground/5"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 업무·프로젝트 */}
          {userContext.includes("work") && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground/70">업무 분야 (복수 선택)</label>
              <div className="grid grid-cols-3 gap-2">
                {WORK_SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleList(workSubjects, setWorkSubjects, s)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                      workSubjects.includes(s)
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/20 hover:bg-foreground/5"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 자기계발·취미 */}
          {userContext.includes("personal") && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground/70">관심 분야 (복수 선택)</label>
              <div className="grid grid-cols-3 gap-2">
                {PERSONAL_SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleList(personalSubjects, setPersonalSubjects, s)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                      personalSubjects.includes(s)
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/20 hover:bg-foreground/5"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
              이전
            </Button>
            <Button type="button" variant="secondary" onClick={handleNext} className="flex-1">
              나중에 설정할게요
            </Button>
            <Button type="button" onClick={handleNext} className="flex-1">
              다음
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: 나의 속도 */}
      {step === 4 && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">나의 속도는요?</h2>
            <p className="text-sm text-foreground/60">AI가 시간을 제안할 때 참고해요</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground/70">나의 속도</label>
            <div className="flex flex-col gap-2">
              {SELF_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setSelfLevel(level.value)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer",
                    selfLevel === level.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:bg-foreground/5"
                  )}
                >
                  <span className="text-sm font-medium">{level.label}</span>
                  <span
                    className={cn(
                      "text-xs ml-2",
                      selfLevel === level.value
                        ? "text-background/70"
                        : "text-foreground/50"
                    )}
                  >
                    {level.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleBack} className="flex-1">
              이전
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              isLoading={isLoading}
              className="flex-1"
            >
              시작하기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
