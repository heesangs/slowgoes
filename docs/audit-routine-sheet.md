# StepSheet 루틴 모드 분석 (audit)

작성일: 2026-05-26
대상 파일: `src/components/dashboard/step-sheet.tsx` (Goal 4에서 `NextStepSheet` + `EditWithAISheet`가 단일 `StepSheet`로 통합됨)
관련 서버 액션: `src/app/(main)/dashboard/actions.ts` (`generateNextStepPreviewAction`, `applyNextStepAction`)
관련 AI 함수: `src/lib/ai/analyze.ts` (`generateSingleNextStep`)
관련 DB 마이그레이션:
- `20260315000000_add_action_items_schema.sql` (routines 테이블 생성)
- `20260510120000_add_time_slot_to_routines.sql` (PR 19, time_slot 컬럼 추가)

---

## 1. 시간대 칩 — 단일 선택 vs 다중 선택

**결론: 단일 선택**

근거:
- `step-sheet.tsx:102` — `const [timeSlot, setTimeSlot] = useState<RoutineTimeSlot | null>(null);` (배열이 아닌 단일 값 / nullable)
- `step-sheet.tsx:316` — `onTimeSlotChange={setTimeSlot}` (setter가 단일 값으로 덮어쓰기)
- `step-sheet.tsx:632–645` — 칩 렌더 시 active 비교가 `timeSlot === slot` (배열 includes 가 아닌 단일 equality)
- DB 스키마(`routines.time_slot`)도 단일 text 컬럼 + CHECK 제약 (`morning|afternoon|evening|night|NULL`). 다중 선택을 보존할 자료구조가 없음.

---

## 2. 요일 / 반복 주기 입력 UI 위치

**결론: 시트 내부에 요일/반복 주기 입력 UI가 전혀 없음. 기본값으로 강제됨.**

- 시트의 루틴 분기 UI(`NextStepBody`, `step-sheet.tsx:599–651`)는 **(a) 종류 chip 2개** + **(b) 시간대 chip 4개**만 노출. 요일 선택, 반복 횟수 입력, "매주/매일" 토글 등은 없음.
- 내부 state로 `routineRepeat` 가 존재(`step-sheet.tsx:104–107`)하지만, **이 값을 변경하는 UI가 없음**. 변경 경로는 AI 생성 결과 수신 1곳뿐.
- 직접 입력(AI 생성 안 함) 경로의 fallback:
  - `step-sheet.tsx:204–205` — `repeatUnit: routineRepeat?.repeatUnit ?? "weekly"`, `repeatValue: routineRepeat?.repeatValue ?? 1`
  - 즉 **사용자가 직접 텍스트를 친 루틴은 무조건 `weekly / 1` (= 매주 1회)로 저장됨**.
- AI 생성 경로:
  - `step-sheet.tsx:158–163` — `generateSingleNextStepPreviewAction` 결과에서 `repeatUnit`, `repeatValue`를 받아 `setRoutineRepeat`. 단, **사용자에게 어떤 주기로 생성되었는지 표시되지 않음**.
- DB 기본값 (`20260315000000_add_action_items_schema.sql`):
  - `repeat_unit text NOT NULL DEFAULT 'weekly'`
  - `repeat_value integer NOT NULL DEFAULT 1 CHECK (repeat_value >= 1 AND repeat_value <= 31)`
- `time_slot`은 NULLable이며 PR 19에서 추가됨 (`20260510120000_add_time_slot_to_routines.sql`). 다만 시트 UI에서는 시간대 미선택 시 저장 자체가 막힘(아래 5번).

→ 결과적으로 "주 N회"인지 "매일"인지를 **유저가 결정할 수단이 시트 안에 없음**. AI에 위임하거나 weekly/1로 고정됨.

---

## 3. 데일리투두 ↔ 루틴 토글 시 입력 텍스트 유지

**결론: 유지되지 않음. 종류를 바꾸면 텍스트가 비워짐.**

- `step-sheet.tsx:307–314` — `onKindChange={(k) => { setKind(k); setTextValue(""); setRoutineRepeat(null); if (k !== "routine") setTimeSlot(null); }}`
- 주석(`step-sheet.tsx:310`)에 의도가 명시되어 있음: "종류가 바뀌면 텍스트와 루틴 메타 리셋 — 의미가 달라지기 때문."
- 사용자가 데일리투두에 텍스트를 입력하다가 "루틴이 더 맞겠다" 싶어 루틴 chip을 누르면 입력값이 즉시 사라짐.

---

## 4. ✨ AI 생성 시 시간대/요일도 함께 생성되는가

**결론: 텍스트(`title`)와 내부 `repeatUnit`/`repeatValue`는 AI가 생성. 시간대(`timeSlot`)는 생성하지 않음. UI 상으로는 "텍스트만 채워지는 것"처럼 보임.**

- `step-sheet.tsx:147–183` (`handleAIGenerate`):
  - next-step + routine 분기에서 결과로 `{ title, repeatUnit, repeatValue }`를 받음 (`SingleNextStepResult`).
  - `setRoutineRepeat({ repeatUnit, repeatValue })` 호출.
  - `setTextValue(result.data.title)` 호출.
  - **`setTimeSlot` 호출 없음** → 시간대는 그대로 (선택 전이면 여전히 null).
- `repeatUnit`/`repeatValue`가 어떤 값으로 들어왔는지 사용자에게 표시되지 않음. UI에 "주 N회" 같은 라벨이 없으므로, 유저는 AI가 텍스트만 만들어줬다고 인지하게 됨.
- AI 함수 시그니처 (`src/lib/ai/analyze.ts:817–862`):
  - `SingleNextStepRoutineResult = { type: "routine"; title; repeatUnit; repeatValue }`
  - 시간대 필드 없음 → AI가 시간대를 추천하는 경로 자체가 없음.

---

## 5. 시간대 미선택 상태에서 "추가하기" 버튼이 비활성화되는가

**결론: 비활성화됨 (routine 선택 시).**

- `step-sheet.tsx:244–250`:
  ```ts
  const canConfirm =
    !isAILoading &&
    !isConfirming &&
    textValue.trim().length > 0 &&
    (mode === "edit-with-ai"
      ? !!editingStride
      : !!kind && (kind === "daily_todo" || !!timeSlot));
  ```
- `kind === "routine"`이고 `timeSlot === null`이면 마지막 절이 false → `canConfirm=false` → `disabled` 상태로 렌더(`step-sheet.tsx:287`).
- `handleConfirm` 내부에도 가드 있음(`step-sheet.tsx:193`): `if (kind === "routine" && !timeSlot) return;` (이중 안전망).

---

## 사용자 혼란 지점 정리

| # | 지점 | 현재 동작 | 사용자가 받는 인상 / 혼란 |
|---|------|-----------|---------------------------|
| 1 | 종류(데일리투두/루틴) 토글 | 클릭 시 textValue/routineRepeat 즉시 리셋, timeSlot도 daily로 갈 땐 리셋 | 텍스트를 다 쳤는데 종류만 바꾸려다 입력값이 통째로 사라짐. "왜 지워졌지?"라는 의문. |
| 2 | 반복 주기 (매주 N회 / 매일) | UI 없음. 직접 입력 시 weekly/1 자동, AI 생성 시 AI가 결정 (유저에게 표시되지 않음) | "직접 입력한 루틴이 일주일에 몇 번 반복되는지 알 수 없음." AI 생성도 어떤 주기로 만들어졌는지 화면에 안 나옴 → 저장 후 대시보드에서 확인해야 함. |
| 3 | 요일 선택 | UI 없음 | 한국어 표현 "월/수/금에 운동"처럼 요일 단위 루틴을 만들고 싶어도 표현할 수단이 없음. |
| 4 | ✨ AI 생성 결과 | title만 textarea에 채워지고, 시간대는 그대로 비어 있음 | "AI가 추천했는데 왜 시간대는 비어 있지?" + 다음 단계로 진행하려면 시간대를 직접 선택해야 함을 인지 못 할 수 있음. |
| 5 | 시간대 단일 선택 제약 | 한 번에 한 시간대만 선택 가능 (다중 선택 불가) | "아침과 저녁 둘 다 하고 싶다"는 표현이 불가능. 사용자는 두 개의 루틴으로 분할해 만들어야 함(이 사실도 UI에서 안내되지 않음). |
| 6 | 시간대 미선택 시 추가하기 비활성화 | 비활성화 ✓ (의도된 동작) | 비활성화 이유 표시(텍스트, hint 등)가 없어, 왜 버튼이 안 눌리는지 즉시 파악하기 어려울 수 있음. ("텍스트 다 썼는데 왜 안 되지?") |
| 7 | AI 토글 OFF + textarea 비어 있음 | "직접 입력하거나 AI 생성을 누르세요" placeholder (`step-sheet.tsx:341`) | AI 토글을 끈 상태에서는 placeholder 문구가 모순적(생성 버튼이 숨겨졌는데 "AI 생성을 누르세요"라고 안내). |
| 8 | 시간대 라벨 "점심" | UI 라벨이 "morning/afternoon/evening/night" → "아침/점심/저녁/밤" 매핑 (`step-sheet.tsx:40–45`) | "점심"이라는 라벨은 식사 시간을 의미할 수도 있어, "낮"이라는 시간대와 의미가 미묘하게 어긋남. (개선 후보지만 사용자 혼란 정도는 낮음) |

---

## 부수 발견 (참고)

- `routineRepeat` state는 `setRoutineRepeat` 호출 경로가 AI 생성 1곳뿐 + 사용자에게 노출되지 않음 → 사실상 "AI 추천 메타데이터의 일시 보관소". UI를 추가하지 않는 한 직접 입력 루틴은 항상 weekly/1로 고정.
- 시트 안에 "수정" 모드(`edit-with-ai`)에서도 시간대/요일/반복 주기 입력 UI는 없음 → 한 번 생성한 루틴의 시간대를 바꾸려면 카드 ⋮ "수정"으로 들어가도 텍스트만 수정 가능. 시간대 변경 경로가 현재 시트 외부에 있는지 별도 확인 필요(본 audit 범위 밖).
- DB 측은 `repeat_value` 1–31을 허용하지만, 클라이언트는 1로만 보내고 있어 스키마 능력 대비 UI 표현력이 작음.
