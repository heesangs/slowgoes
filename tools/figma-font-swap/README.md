# Figma 텍스트 스타일 폰트 일괄 교체

slowgoes Figma 파일의 **텍스트 스타일 55개**의 폰트를 한 번에 바꾼다.

## 왜 플러그인인가

Figma MCP 연결은 **로컬에 설치된 폰트에 접근하지 못한다.** 변수 쓰기는 되는데
(색 토큰은 MCP로 바꿨다) `loadFontAsync`는 Figma 클라우드 폰트만 성공한다 —
설치가 확실한 `Apple SD Gothic Neo`조차 실패한다. 폰트 목록도 Google Fonts
1,938개뿐이고 macOS 시스템 폰트가 하나도 없다.

그래서 폰트 교체만은 데스크톱 Figma 안에서 돌려야 한다.

## 쓰는 법

1. Figma 데스크톱에서 대상 파일을 연다
2. `Plugins → Development → Import plugin from manifest…` → 이 폴더의 `manifest.json`
3. `Plugins → Development → slowgoes — Font Swap` 실행
4. 처음에는 `DRY_RUN = true`라 **무엇이 바뀔지 출력만** 한다. 내용을 확인한다
5. `code.js`의 `DRY_RUN`을 `false`로 바꾸고 다시 실행

플러그인을 다시 불러올 필요는 없다 — 실행할 때마다 `code.js`를 새로 읽는다.

## 설정 (`code.js` 맨 위)

```js
const FROM = "Pretendard";                 // 바꿀 대상 폰트
const TO_PATTERN = /g\s*market/i;          // 새 폰트를 이름으로 찾는다
const STYLE_MAP = { Regular: "Medium", Medium: "Medium", Bold: "Bold" };
const DRY_RUN = true;
```

**`Regular → Medium`인 이유** — Gmarket Sans에는 Regular(400)가 없다.
코드에서도 기본 본문(400)을 Medium이 받게 해뒀다(`src/app/layout.tsx`).

## 안전장치

- **폰트 이름을 추측하지 않는다** — `Gmarket Sans`인지 `GmarketSans`인지
  설치된 목록에서 찾아 확정하고, 못 찾으면 후보를 보여주고 멈춘다
- **`FROM` 폰트를 쓰는 스타일만** 건드린다 — SF Pro·Paperlogy·NanumSquareRound를
  쓰는 스타일은 자동으로 빠진다
- **`STYLE_MAP`에 없는 굵기는 건너뛴다** — 임의로 매핑하지 않고 보고만 한다
- **face를 전부 먼저 로드한다** — 하나라도 실패하면 아무것도 바꾸지 않는다

## 바뀌지 않는 것

**폰트를 스타일 없이 직접 지정한 텍스트.** "작업" 페이지 기준 864개 중
116개가 여기 해당하고, 그중 42개가 Pretendard다. 나머지 74개는 의도적으로 다른
폰트(NanumSquareRound·MaruBuri·Inter)를 쓰는 것이라 건드리면 안 된다.

스타일 교체 후 Figma의 `Text → Fonts` 패널에서 남은 Pretendard를 따로 정리한다.

## 되돌리기

`FROM`/`TO_PATTERN`을 맞바꾸고 `STYLE_MAP`을 역방향으로 두면 재실행으로 돌아간다.

다만 **`Regular → Medium`은 정보를 잃는 매핑**이다 — 되돌릴 때 원래 Regular였는지
Medium이었는지 구분할 수 없다. 정확히 복구하려면 **Figma 버전 히스토리**를 쓴다.
