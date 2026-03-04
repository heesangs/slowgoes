# slowgoes 프로젝트 초기화 가이드

## 🚀 Claude Code에서 실행할 순서

아래 내용을 순서대로 Claude Code에 입력하세요.

---

### Step 1: CLAUDE.md 복사

먼저 이 가이드와 함께 제공된 `CLAUDE.md` 파일을 `slowgoes/` 폴더 루트에 넣으세요.
Claude Code가 이 파일을 자동으로 읽고 프로젝트 컨텍스트로 활용합니다.

```
cp CLAUDE.md ~/slowgoes/CLAUDE.md
```

---

### Step 2: 프로젝트 초기화 프롬프트

Claude Code에서 아래 프롬프트를 입력하세요:

```
CLAUDE.md를 읽고 slowgoes 프로젝트를 초기화해줘.

1. pnpm create next-app으로 Next.js 15 프로젝트 생성
   - TypeScript, Tailwind CSS, App Router, src/ 디렉토리 사용
   - ESLint 활성화

2. 필요한 패키지 설치:
   - @supabase/supabase-js @supabase/ssr
   - @google/generative-ai
   - 기타 CLAUDE.md에 명시된 것들

3. CLAUDE.md의 프로젝트 구조대로 디렉토리 생성

4. .env.local 템플릿 파일 생성:
   - NEXT_PUBLIC_SUPABASE_URL=
   - NEXT_PUBLIC_SUPABASE_ANON_KEY=
   - SUPABASE_SERVICE_ROLE_KEY=
   - GOOGLE_AI_API_KEY=

5. Supabase 클라이언트 설정 파일 생성
   (src/lib/supabase/client.ts, server.ts, middleware.ts)

6. 기본 레이아웃과 랜딩 페이지 생성
```

---

### Step 3: Supabase 프로젝트 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. Project Settings → API에서 키 복사
3. `.env.local`에 붙여넣기:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
   ```
4. SQL Editor에서 CLAUDE.md의 데이터 모델 테이블 생성

---

### Step 4: Google Gemini API 키 설정

1. [aistudio.google.com](https://aistudio.google.com)에서 API 키 발급
2. `.env.local`에 추가:
   ```
   GOOGLE_AI_API_KEY=AIzaSy...
   ```

---

### Step 5: 첫 번째 기능 개발 프롬프트

프로젝트 초기화가 끝나면, MVP의 핵심 기능부터 시작하세요:

```
할 일 등록 페이지를 만들어줘.

- /tasks/new 라우트
- 텍스트 입력 필드 하나 (예: "영어 중간고사 준비")
- "분석하기" 버튼을 누르면:
  1. Gemini API로 할 일을 세부 항목으로 분해
  2. 각 항목에 난이도(easy/medium/hard)와 예상 시간(분) 추천
  3. 결과를 카드 리스트로 보여줌
  4. 각 카드에서 난이도와 시간을 유저가 조정 가능
  5. "확정하기" 버튼으로 Supabase에 저장
```

---

### Step 6: 이후 개발 순서 (권장)

| 순서 | 기능 | 프롬프트 힌트 |
|------|------|--------------|
| 1 | ✅ 할 일 등록 + AI 분석 | Step 5 참고 |
| 2 | 대시보드 | "오늘의 할일 목록을 보여주는 대시보드" |
| 3 | 세부 할일 체크리스트 | "세부 할일을 체크하며 진행하는 실행 화면" |
| 4 | 인증 | "Supabase Auth로 이메일 로그인/회원가입" |
| 5 | 회고 | "예상 시간 vs 실제 시간 비교 화면" |
| 6 | 배포 | "Vercel에 배포하고 도메인 연결" |

---

## 💡 Claude Code 사용 팁

- **CLAUDE.md를 항상 최신으로 유지**하세요. 새 기능이나 규칙이 생기면 업데이트.
- **한 번에 하나의 기능**만 요청하세요. 여러 기능을 한번에 요청하면 품질이 떨어집니다.
- **구체적으로 요청**하세요. "할일 페이지 만들어줘"보다 위의 Step 5처럼 상세하게.
- **에러가 나면 에러 메시지를 그대로 붙여넣기**하세요. Claude Code가 바로 수정합니다.
- 개발 중 궁금한 점은 "CLAUDE.md 기준으로 ___는 어떻게 하면 될까?"로 물어보세요.
