# StepSheet 루틴 모드 — 빠른 수정 PR 계획

작성일: 2026-05-26
기반 문서: `docs/audit-routine-sheet.md`
대상 파일: `src/components/dashboard/step-sheet.tsx`
관련 서버 액션: `src/app/(main)/dashboard/actions.ts` (`applyNextStepAction`, `generateNextStepPreviewAction`)
관련 AI 함수: `src/lib/ai/analyze.ts` (`generateSingleNextStep`, `SingleNextStepRoutineResult`)
관련 DB:
- `routines.repeat_unit` (`'daily' | 'weekly'`, default `'weekly'`)
- `routines.repeat_value` (1~31, default `1`)
- `routines.time_slot` (`'morning' | 'afternoon' | 'evening' | 'night' | NULL`)

---

## 전체 전략 (한 줄)

> **현재 시트 안에 "텍스트 → 종류 → 시간대 → 요일/주기 → 저장" 5단계를 모두 노출**하고, **AI가 결정한 메타데이터는 같은 UI에 비춰** 사용자가 즉시 검토·수정할 수 있게 만든다. 종류 토글은 "글 다 쓰고 분류만 바꾸는" 자연스러운 흐름을 깨지 않도록 텍스트를 보존한다.

수정은 빠른 PR 1건으로 합치되 변경 범위는 다음 4개 항목으로 한정한다:

1. [최우선] 종류 토글 시 텍스트 보존
2. [필수] 반복 주기 UI 추가 (요일 + 프리셋)
3. [필수] AI 생성 결과 투명화 (요일/주기 노출)
4. [개선] 시간대는 단일 유지 + 비활성 버튼 안내 추가

코드 변경은 본 문서 범위 밖. 본 문서는 설계만.

---

## 1. [최우선] 종류 토글 시 텍스트 보존

### 현재 동작 (확인 결과)

- `step-sheet.tsx:307-314`
  ```ts
  onKindChange={(k) => {
    setKind(k);
    // 종류가 바뀌면 텍스트와 루틴 메타 리셋 — 의미가 달라지기 때문.
    setTextValue("");
    setRoutineRepeat(null);
    if (k !== "routine") setTimeSlot(null);
  }}
  ```
- 데일리투두 → 루틴 (혹은 반대) 토글 시 `textValue`가 즉시 비워진다.
- 주석에 "의미가 달라지기 때문"이라 적혀 있지만, 실제로는 동일한 한 문장(예: "5분 산책하기")이 "오늘 한 번 / 매일" 양쪽 모두로 의미가 통한다 → 종류와 텍스트는 직교(orthogonal) 관계이다.

### 변경 후 동작

- 종류 토글은 `kind` 와 `kind` 에만 종속된 메타(`routineRepeat`, `timeSlot`)만 리셋.
- `textValue`는 사용자의 직접 입력이므로 보존.
- 단, AI 생성 결과(`source = 'ai_generated'`)는 종류가 바뀌면 더 이상 그 텍스트가 맞다고 보장할 수 없으니, **"AI가 채워준 텍스트인지" 플래그**를 작은 state로 두고 종류가 바뀐 순간에만 비운다. (직접 입력은 보존, AI 결과는 종류 변경 시 비움.)

### 변경할 파일

- `src/components/dashboard/step-sheet.tsx`
  - state 추가: `const [isAIFilled, setIsAIFilled] = useState(false);`
  - `handleAIGenerate` 성공 분기 끝에서 `setIsAIFilled(true)` 호출.
  - textarea `onChange` 안에서 `setIsAIFilled(false)` 호출 (사용자가 손대면 더 이상 AI 결과 아님).
  - `onKindChange` 콜백을 다음으로 교체:
    ```ts
    onKindChange={(k) => {
      setKind(k);
      setRoutineRepeat(null);
      if (k !== "routine") setTimeSlot(null);
      // AI가 채워준 텍스트는 종류가 바뀌면 더 이상 유효하지 않으므로 비움.
      if (isAIFilled) {
        setTextValue("");
        setIsAIFilled(false);
      }
    }}
    ```

### 예상 부작용

- 다른 화면 영향 없음 (state는 시트 내부 한정).
- 기존 데이터 호환성 영향 없음 (DB 변경 없음).
- 진입 시 리셋 로직(`useEffect`, `step-sheet.tsx:115-127`)에 `setIsAIFilled(false)` 한 줄 추가 필요.

### 테스트 시나리오

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 종류 미선택 → "5분 산책" 입력 → 데일리투두 클릭 → 루틴 클릭 | 텍스트 "5분 산책" 보존, kind만 토글 |
| 2 | 루틴 + 시간대(아침) + "물 마시기" 입력 → 데일리투두 클릭 | 텍스트 보존, timeSlot/routineRepeat 리셋 |
| 3 | 데일리투두 + AI 생성 → 루틴으로 토글 | AI 결과 텍스트는 비워짐 (재추천 유도) |
| 4 | 데일리투두 + AI 생성 → 사용자가 한 글자라도 수정 → 루틴 토글 | 수정된 텍스트는 보존 (`isAIFilled=false` 로 강등) |
| 5 | 시트 close → 재오픈 | textValue/isAIFilled 모두 초기화 |

---

## 2. [필수] 반복 주기 UI 추가 (요일 + 프리셋)

### 현재 동작

- 시트 안에 요일/주기 입력 UI **없음**.
- 직접 입력 루틴은 항상 `weekly / 1` 로 고정 저장 (`step-sheet.tsx:204-205`).
- AI 생성 루틴만 `repeatUnit`/`repeatValue`가 들어오지만 사용자는 볼 수 없음.
- DB 컬럼 `routines.repeat_unit`(`daily|weekly`)와 `routines.repeat_value`(1~31)는 존재하나, **특정 요일(예: 월/수/금)** 을 저장할 수단은 없다 — 컬럼 자체가 없음.

### 설계 결정 — schema 확장 필요 여부

요청은 "요일 선택 + 프리셋([매일][평일][주말])"이다. 두 가지 접근이 있다.

#### 옵션 A — schema 그대로 (요일 미저장, 주기만 저장)

- "매일" 프리셋 = `repeat_unit='daily', repeat_value=1`
- "평일" 프리셋 = `repeat_unit='weekly', repeat_value=5`
- "주말" 프리셋 = `repeat_unit='weekly', repeat_value=2`
- 사용자 개별 요일 선택은 **저장되지 않음** (UI에서만 보이고 DB는 횟수만)
- 장점: schema 변경 없음, 빠른 PR.
- 단점: "월/수/금" 같은 사용자의 의도된 요일 패턴이 사라짐. 다음 주에 같은 루틴이 보일 때 어느 요일에 하기로 했는지 알 수 없음 → 의미 손실.

#### 옵션 B — schema 확장 (요일까지 저장) ✅ 추천

- `routines.days_of_week int[]` 컬럼 추가. 0=일요일, 1=월, ..., 6=토.
- 매일 = `[0,1,2,3,4,5,6]`, 평일 = `[1,2,3,4,5]`, 주말 = `[0,6]`, 사용자 임의 선택 = 그대로.
- `repeat_unit`/`repeat_value`는 **유지하되 의미를 좁힌다**:
  - `days_of_week`가 채워져 있으면 그것이 사실상 truth (배열 length가 주당 반복 횟수).
  - 빈 배열이면 기존처럼 `repeat_unit`/`repeat_value` fallback.
- 장점: 사용자 의도 보존, 향후 캘린더/통계에서 "오늘은 이 루틴 해야 하는 날" 같은 진짜 요일 기반 UX 가능.
- 단점: migration 1건 추가, `applyNextStepAction` payload 확장, `Routine` 타입 확장.

**결론: B를 채택**. 이유:
- 요일 UI를 보여주는 순간 사용자는 "여기서 선택한 요일이 저장될 것"이라 기대한다. UI에서만 보이고 저장 안 되면 다음 주에 사라져 더 큰 혼란을 부른다.
- migration 비용이 작다 (NULLable 컬럼 추가, 기존 row 영향 없음).

### 변경할 파일

#### 신규 마이그레이션 (초안)

`supabase/migrations/20260527000000_add_days_of_week_to_routines.sql`

```sql
-- routines.days_of_week — 루틴의 요일 패턴 (0=일 ~ 6=토).
-- NULL 또는 빈 배열이면 "요일 미지정" — repeat_unit/repeat_value로 fallback.
--
-- 예시:
--   매일       → ARRAY[0,1,2,3,4,5,6]
--   평일       → ARRAY[1,2,3,4,5]
--   주말       → ARRAY[0,6]
--   월/수/금   → ARRAY[1,3,5]
--   주 1회(요일 무관) → NULL  (사용자가 요일을 정하지 않은 경우)
--
-- 백필: 기존 routines는 NULL로 두어 동작이 바뀌지 않게 한다.
-- 롤백: 컬럼 DROP 만으로 안전.

ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS days_of_week smallint[];

ALTER TABLE public.routines
  DROP CONSTRAINT IF EXISTS routines_days_of_week_check;

ALTER TABLE public.routines
  ADD CONSTRAINT routines_days_of_week_check
  CHECK (
    days_of_week IS NULL
    OR (
      array_length(days_of_week, 1) BETWEEN 1 AND 7
      AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
    )
  );

COMMENT ON COLUMN public.routines.days_of_week IS
  '루틴 반복 요일 (0=Sun ~ 6=Sat). NULL이면 요일 미지정 (repeat_unit/repeat_value로 fallback).';
```

> 주의: `<@` (subset) 연산자는 `intarray` extension 없이도 기본 배열 연산자로 사용 가능. 중복 방지는 클라이언트 사이드에서 처리 (Set 변환).

#### `src/types/index.ts`

- `Routine` 인터페이스에 `days_of_week: number[] | null` 추가.
- `applyNextStepAction` payload 타입(또는 별도 routine input 타입)에 `daysOfWeek?: number[] | null` 추가.

#### `src/app/(main)/dashboard/actions.ts`

- `applyNextStepAction`의 `routine` payload에 `daysOfWeek?: number[] | null` 받기.
- 검증:
  - 배열 길이 1~7
  - 모든 값이 0~6 정수
  - 중복 제거 후 저장
- `routines` INSERT에 `days_of_week: payload.routine.daysOfWeek ?? null` 추가.
- (선택) `daysOfWeek`가 주어지면 `repeat_unit`/`repeat_value`를 길이 기반으로 자동 정규화:
  - 길이 7 → `daily / 1`
  - 1~6 → `weekly / length`
  - 이 정규화는 통계/리스트에서 기존 컬럼만 보는 곳을 안전하게 유지하기 위함.

#### `src/components/dashboard/step-sheet.tsx`

- 시간대 칩 아래 새 블록 "어떤 요일에 반복할까요?" 추가.
- state 추가:
  ```ts
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  ```
- 프리셋 버튼 3개: `[매일][평일][주말]`. 클릭 시 `setDaysOfWeek([...])`.
- 요일 칩 7개 (일/월/화/수/목/금/토). 토글로 `daysOfWeek` 추가/제거.
- 현재 선택이 어느 프리셋과 동일하면 그 프리셋 chip을 active로 표시 (시각 일관성).
- 직접 입력 모드에서는 사용자가 명시적으로 선택해야 함 — 비어 있으면 저장 비활성 (canConfirm 조건 확장).
- `handleConfirm`에서 routine payload에 `daysOfWeek` 포함.
- 진입/리셋 useEffect / `onKindChange` / `handleModeSwitch`에서 `setDaysOfWeek([])` 추가.

### 변경 전후 동작 비교

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 직접 입력 루틴 저장 시 주기 | 무조건 `weekly/1` | 사용자가 고른 요일 패턴 (`days_of_week` + 길이 기반 `repeat_unit`/`repeat_value`) |
| UI 노출 | 없음 | 프리셋 3개 + 요일 칩 7개 |
| 비활성 버튼 조건 | 시간대만 체크 | 시간대 + 요일 1개 이상 |
| 다음 주 캘린더/통계 (향후) | 요일 정보 없음 | `days_of_week`로 요일별 기대 횟수 계산 가능 |

### 예상 부작용

- 기존 row (NULL `days_of_week`)는 기존 로직(`repeat_unit`/`repeat_value`)대로 동작. 데이터 호환 안전.
- 온보딩 RPC `save_onboarding_journey`는 `days_of_week`을 받지 않으므로 NULL로 들어간다 — 동작 그대로. (필요 시 별도 PR에서 확장.)
- `generateWeeklyItemsAction` 등 AI 다건 생성 경로도 `days_of_week`를 채우지 않음 → NULL → 기존 fallback 동작. 안전.
- `getRoutineCompletionsForMonthAction`은 영향 없음 (완료 기록 조회만 함).

### 테스트 시나리오

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 루틴 + 시간대 선택 + 요일 미선택 | 추가하기 버튼 비활성 (요일 1개 이상 필요) |
| 2 | "매일" 프리셋 클릭 → 저장 | DB: `days_of_week=[0..6]`, `repeat_unit='daily'`, `repeat_value=1` |
| 3 | "평일" 프리셋 클릭 → 저장 | DB: `days_of_week=[1,2,3,4,5]`, `repeat_unit='weekly'`, `repeat_value=5` |
| 4 | 월/수/금 직접 클릭 → 저장 | DB: `days_of_week=[1,3,5]`, `repeat_value=3` |
| 5 | "평일" 프리셋 → 화 칩 추가 클릭 | `days_of_week=[1,2,3,4,5]` → `[1,2,3,4,5]` (이미 포함, no-op) ; 토 추가 시 `[1,2,3,4,5,6]` |
| 6 | 종류를 데일리투두로 토글 | `daysOfWeek` 빈 배열로 리셋 |
| 7 | 기존 NULL 루틴 → 대시보드 카드 표시 | 깨짐 없음 (fallback 동작) |

---

## 3. [필수] AI 생성 결과 투명화

### 현재 동작

- `step-sheet.tsx:158-163` — AI가 반환한 `repeatUnit`/`repeatValue`를 `routineRepeat` state에 담지만 UI에는 표시되지 않음.
- 사용자는 textarea 내용만 보고 "AI가 텍스트만 만들어줬다"고 인지.
- 저장 시 그 메타가 그대로 DB에 들어가 사용자 의도와 어긋날 위험.

### 변경 후 동작

- AI 생성 성공 직후, **2번에서 만든 요일/주기 UI에 AI 결과를 반영**한다.
- `repeatUnit='daily'` → `daysOfWeek=[0..6]` ("매일" 프리셋 active 표시)
- `repeatUnit='weekly', repeatValue=N` → 요일 정보가 없으므로, 사용자에게 **"AI는 주 N회 추천 — 어느 요일에 할지 선택해 주세요"** 안내 텍스트를 한 줄 띄운다.
- (선택, 추후) AI 시그니처를 확장해 `daysOfWeek?: number[]`도 반환하게 만들면 더 좋다. 본 빠른 PR 범위에서는 **유저 결정**으로 남긴다.

### 변경할 파일

- `src/components/dashboard/step-sheet.tsx`
  - `handleAIGenerate` 성공 분기 (`result.data.type === "routine"`) 에서:
    ```ts
    setRoutineRepeat({ repeatUnit: result.data.repeatUnit, repeatValue: result.data.repeatValue });
    if (result.data.repeatUnit === "daily") {
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    } else {
      setDaysOfWeek([]); // 사용자가 요일 직접 선택하도록 유도
    }
    ```
  - 요일 블록 위에 작은 hint 영역 추가:
    ```tsx
    {kind === "routine" && routineRepeat && (
      <p className="text-[11px] text-foreground/55">
        ✨ AI 추천: {routineRepeat.repeatUnit === "daily"
          ? "매일"
          : `주 ${routineRepeat.repeatValue}회`}
        {" "}— 요일은 직접 골라 주세요.
      </p>
    )}
    ```

### 변경 전후 동작 비교

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| AI가 추천한 주기 노출 | 없음 | "✨ AI 추천: 매일/주 N회" hint |
| AI가 "매일" 추천 | UI 변화 없음, DB만 `daily/1` 저장 | "매일" 프리셋이 자동 active 표시 |
| AI가 "주 3회" 추천 | UI 변화 없음 | 요일 미선택 상태 + hint로 사용자 요일 선택 유도 |
| 사용자 검토 가능성 | 불가능 (값이 숨어 있음) | 가능 (UI에 그대로 반영) |

### 예상 부작용

- `SingleNextStepRoutineResult` 타입은 그대로. AI 함수 변경 없음.
- `routineRepeat` state는 그대로 유지 (hint 표시에만 사용).
- 사용자 입장에서 AI 직후 화면이 약간 더 길어짐 — bottom sheet 내부 스크롤로 흡수 가능.

### 테스트 시나리오

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 루틴 선택 → AI 생성 (Gemini가 daily 반환) | textarea 채워짐 + "매일" 프리셋 active + "✨ AI 추천: 매일" hint |
| 2 | 루틴 선택 → AI 생성 (Gemini가 weekly/3 반환) | textarea 채워짐 + 요일 미선택 + "✨ AI 추천: 주 3회 — 요일은 직접 골라 주세요" hint |
| 3 | AI 후 사용자가 "평일" 프리셋 클릭 | `daysOfWeek=[1..5]`, hint는 그대로 (사용자가 검토 후 변경한 결과) |
| 4 | AI 후 종류를 데일리투두로 토글 | `routineRepeat=null`, `daysOfWeek=[]`, hint 사라짐, AI 텍스트도 비워짐 (1번 항목 규칙) |

---

## 4. [개선] 시간대 — 단일 선택 유지 + 비활성 버튼 안내

### 4.1 시간대 다중 선택 vs 단일 — **단일 유지 추천**

#### 근거

1. **DB가 단일이다.** `routines.time_slot text CHECK (... IN (...))` — 다중 저장 구조 없음. 다중을 도입하려면 `text[] + CHECK` 또는 별도 join 테이블이 필요해 빠른 PR 범위를 벗어난다.
2. **사용자 멘탈 모델.** 한국어 표현 "아침에 스트레칭, 저녁에 산책"은 보통 **두 개의 다른 루틴**이다. 같은 행동을 두 시간대에 한다는 시나리오(예: 아침저녁으로 양치)는 드물고, 그 경우에도 두 루틴으로 나누는 편이 회고/통계에서 더 명확하다.
3. **요일 차원 도입과 동시에 시간대까지 다중화하면 UI 복잡도가 급증.** 본 PR에서는 요일이 핵심 추가 차원이고, 시간대는 단일을 유지해 정보 밀도를 관리한다.
4. **향후 확장 여지는 막지 않음.** 다중이 진짜 필요해지면 별도 PR에서 `routines.time_slots text[]` 마이그레이션 + UI 다중화로 자연스럽게 옮길 수 있다 (요일 추가와 같은 패턴).

#### 따라서

시간대 칩은 **단일 선택 그대로 유지**. `step-sheet.tsx:632-645`의 비교 `timeSlot === slot` 그대로.

### 4.2 비활성 "추가하기" 버튼 사유 표시

#### 현재 동작

- `canConfirm` (`step-sheet.tsx:244-250`): 텍스트 + (데일리투두 OR (루틴 AND 시간대)) 시 true.
- false면 버튼은 회색 비활성 — **이유 표시 없음**.
- 2번 항목 적용 후엔 여기에 "요일 1개 이상" 조건이 더해진다 → 비활성 사유가 더 다양해지므로 안내가 필수.

#### 변경 후 동작

footer 영역(추가하기 버튼 바로 위)에 **비활성 사유 한 줄**을 표시한다.

- 텍스트가 비어 있으면 → "행동을 한 문장으로 적어 주세요"
- 종류 미선택 → "추가할 종류를 골라 주세요"
- 루틴 + 시간대 미선택 → "언제 실천할지 시간대를 골라 주세요"
- 루틴 + 시간대 OK + 요일 미선택 → "어떤 요일에 반복할지 골라 주세요"
- 모두 OK → 안내 숨김 (버튼 활성)

우선순위는 위에서 아래로 (가장 먼저 부족한 것 1개만).

### 변경할 파일

- `src/components/dashboard/step-sheet.tsx`
  - 새로운 유틸 함수:
    ```ts
    function getDisabledReason(args: {
      mode: StepSheetMode;
      textValue: string;
      kind: NextStepKind | null;
      timeSlot: RoutineTimeSlot | null;
      daysOfWeek: number[];
      editingStride: StrideItem | null;
    }): string | null {
      if (!args.textValue.trim()) return "행동을 한 문장으로 적어 주세요";
      if (args.mode === "edit-with-ai") {
        return args.editingStride ? null : "수정할 발걸음이 없어요";
      }
      if (!args.kind) return "추가할 종류를 골라 주세요";
      if (args.kind === "routine") {
        if (!args.timeSlot) return "언제 실천할지 시간대를 골라 주세요";
        if (args.daysOfWeek.length === 0) return "어떤 요일에 반복할지 골라 주세요";
      }
      return null;
    }
    ```
  - `BottomSheet`의 `footer` prop을 다음과 같이 확장:
    ```tsx
    footer={
      showEmptyGuard ? undefined : (
        <div className="flex flex-col gap-1.5">
          {!canConfirm && disabledReason && (
            <p className="text-center text-[11px] text-foreground/55">
              {disabledReason}
            </p>
          )}
          <Button ... disabled={!canConfirm}>
            {mode === "edit-with-ai" ? "저장" : "추가하기"}
          </Button>
        </div>
      )
    }
    ```

### 변경 전후 동작 비교

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 버튼 비활성 사유 | 표시 안 됨 | 버튼 위 한 줄로 가장 먼저 부족한 항목 안내 |
| 시간대 단일/다중 | 단일 | 단일 (유지) |
| 비활성 → 활성 전환 | 사용자 시행착오 | 안내 따라 채우면 자동 활성 |

### 예상 부작용

- 다른 화면 영향 없음 (BottomSheet footer 내부 한정).
- 접근성 향상: `aria-describedby`로 버튼과 사유 연결 가능 (선택사항).
- 안내 텍스트 분기 추가로 코드 약 20줄 증가.

### 테스트 시나리오

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 시트 진입 직후 (전부 빈 상태) | "행동을 한 문장으로 적어 주세요" |
| 2 | 텍스트 입력 후 종류 미선택 | "추가할 종류를 골라 주세요" |
| 3 | 루틴 + 텍스트만 | "언제 실천할지 시간대를 골라 주세요" |
| 4 | 루틴 + 시간대 + 텍스트 (요일 빈) | "어떤 요일에 반복할지 골라 주세요" |
| 5 | 데일리투두 + 텍스트 | 안내 없음, 버튼 활성 |
| 6 | 모두 채움 | 안내 없음, 버튼 활성 |
| 7 | edit-with-ai 모드 + 빈 텍스트 | "행동을 한 문장으로 적어 주세요" (4.2의 모드 분기) |

---

## 종합: PR 범위 요약

### 코드 변경 파일

| 경로 | 변경 요약 |
|------|-----------|
| `src/components/dashboard/step-sheet.tsx` | `isAIFilled` state, `daysOfWeek` state, 요일/프리셋 UI, AI 결과 hint, 비활성 사유 footer, `getDisabledReason` 유틸, `NextStepBody` 확장 |
| `src/app/(main)/dashboard/actions.ts` | `applyNextStepAction` payload에 `daysOfWeek` 추가 + 검증 + INSERT 컬럼 + 길이 기반 `repeat_unit`/`repeat_value` 정규화 |
| `src/types/index.ts` | `Routine.days_of_week: number[] \| null` 추가 |
| `supabase/migrations/20260527000000_add_days_of_week_to_routines.sql` | 신규 — `routines.days_of_week smallint[]` 컬럼 + CHECK |

### 영향 받지 않는 곳

- 온보딩 흐름 (`save_onboarding_journey`) — 새 컬럼은 NULL로 들어감, fallback 동작.
- 대시보드 카드/캘린더 — `repeat_unit`/`repeat_value`는 길이 기반으로 함께 채우므로 기존 표시 로직 그대로.
- 회고/통계 (`action_logs`, `routine_completions`) — 변경 없음.
- AI 함수 (`analyze.ts`) — 시그니처 변경 없음 (요일 결정은 사용자 몫).

### 머지 전 확인 사항

- [ ] migration이 prod 권한으로 idempotent (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`)인지 확인.
- [ ] 기존 NULL row가 대시보드/캘린더에서 깨지지 않는지 직접 확인 (skim).
- [ ] StepSheet 7가지 시나리오 (1번 + 2번 + 3번 + 4번 합본) 수동 테스트.
- [ ] `applyNextStepAction` 의 `daysOfWeek` 검증이 잘못된 입력(빈 배열 / out-of-range / 중복)을 명확한 에러로 거절.

### 비범위 (별도 PR로 미루기)

- AI가 `daysOfWeek`까지 추천하도록 `SingleNextStepRoutineResult` 확장 — 본 PR에서는 사용자 결정으로 남김.
- 시간대 다중 선택 — 위 4.1 근거로 미룸.
- 온보딩 RPC가 `daysOfWeek`를 받도록 확장 — 본 PR은 시트 흐름만 손봄.
- "점심" 라벨을 "낮" 등으로 바꾸는 UI 문구 개선 — audit 7번 항목, 혼란도 낮음.
- AI 토글 OFF 시 placeholder 문구 모순 — audit 7번 항목.

---

## 부록: 비활성 사유 한 줄 텍스트 후보

언어 톤은 기존 시트 안내 문구(`"행동을 한 문장으로 적어주세요"`, `"언제 실천하실 건가요?"`)와 맞춘다.

| 상태 | 후보 A | 후보 B |
|------|--------|--------|
| 텍스트 빈 | "행동을 한 문장으로 적어 주세요" | "무엇을 추가할지 적어 주세요" |
| 종류 미선택 | "추가할 종류를 골라 주세요" | "데일리 투두 또는 루틴을 선택해 주세요" |
| 시간대 미선택 | "언제 실천할지 시간대를 골라 주세요" | "시간대를 선택해 주세요" |
| 요일 미선택 | "어떤 요일에 반복할지 골라 주세요" | "반복할 요일을 1개 이상 선택해 주세요" |

A안 채택 권장 (기존 시트 어휘와 가장 가까움).
