# Figma 보조 플러그인

두 가지 일을 한다. 둘 다 **MCP 연결로는 할 수 없는 것**이다.

1. **폰트 교체** — 텍스트 스타일의 폰트를 한 번에 바꾼다
2. **선택 영역 텍스트 정리** — MCP 가 그린 화면의 텍스트 크기·정렬을 제자리로 되돌린다

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
4. 창이 열리면 **바뀔 내용을 먼저 보여준다.** 확인 후 `[폰트 교체 적용]`을 누른다

텍스트 정리는 캔버스에서 프레임을 고른 뒤 `[선택 영역 텍스트 정리]`를 누른다.

`code.js`를 직접 고칠 필요는 없다. 버튼을 누르기 전까지는 아무것도 바뀌지 않는다.

## 설정 (`code.js` 맨 위)

```js
const FROM = "Pretendard";                 // 바꿀 대상 폰트
const TO_PATTERN = /g\s*market/i;          // 새 폰트를 이름으로 찾는다
const STYLE_MAP = { Regular: "Medium", Medium: "Medium", Bold: "Bold" };
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
- **`[적용하기]`를 누르기 전까지 아무것도 바뀌지 않는다**

## 바뀌지 않는 것

**폰트를 스타일 없이 직접 지정한 텍스트.** "작업" 페이지 기준 864개 중
116개가 여기 해당하고, 그중 42개가 Pretendard다. 나머지 74개는 의도적으로 다른
폰트(NanumSquareRound·MaruBuri·Inter)를 쓰는 것이라 건드리면 안 된다.

스타일 교체 후 Figma의 `Text → Fonts` 패널에서 남은 Pretendard를 따로 정리한다.

## 되돌리기

`FROM`/`TO_PATTERN`을 맞바꾸고 `STYLE_MAP`을 역방향으로 두면 재실행으로 돌아간다.

다만 **`Regular → Medium`은 정보를 잃는 매핑**이다 — 되돌릴 때 원래 Regular였는지
Medium이었는지 구분할 수 없다. 정확히 복구하려면 **Figma 버전 히스토리**를 쓴다.

## 왜 텍스트 정리가 필요한가

MCP 연결에는 로컬 폰트가 없어 **글자 크기를 계산하지 못한다.** 그래서 MCP 로 화면을
그리면 텍스트 노드가 만들 때 크기(Inter 기준) 그대로 굳어 잘려 보이고,
`textAutoResize` 와 `textAlignHorizontal` 은 아예 쓰지 못한다.

데스크톱 Figma 에는 폰트가 있으므로 한 번 훑어 주면 제자리를 찾는다.
정렬은 부모 프레임 이름으로 정한다(MCP 가 만든 구조의 규칙):
`head` · `foot` · `btn_fill/*` 은 가운데, 나머지는 왼쪽.

폰트는 전부 먼저 로드하고, 하나라도 실패하면 아무것도 바꾸지 않는다.
