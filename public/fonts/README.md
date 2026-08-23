# Pretendard 서브셋

Figma 텍스트 스타일이 쓰는 폰트. KS X 1001 서브셋(한글 2350자 + 라틴) 공식 빌드다.

- 출처: https://github.com/orioncactus/pretendard
  `packages/pretendard/dist/web/static/woff2-subset/`
- 라이선스: SIL Open Font License 1.1
- 굵기: Figma가 쓰는 Regular(400) · Medium(500) · Bold(700) 셋만. 합계 787KB.
  전체 Variable은 2,009KB이고 variable 서브셋 빌드는 없다.
- 서브셋에 없는 드문 한자·특수문자는 layout.tsx의 fallback이 받는다.

교체할 때는 `src/app/layout.tsx`의 `localFont` 선언도 함께 본다.
