# 폰트

## 쓰는 것 — Gmarket Sans

지마켓이 배포하는 무료 글꼴. **"누구나 제약 없이 자유롭게 수정하고 재배포"** —
자체호스팅·서브셋 모두 자유롭다. (https://corp.gmarket.com/fonts/)

공식은 웹폰트를 배포하지 않아 `GmarketSansTTF.zip` 을 받아 직접 만들었다:

    pyftsubset GmarketSansTTF{Light,Medium,Bold}.ttf \
      --unicodes-file=<Pretendard 서브셋의 cmap> \
      --flavor=woff2 --layout-features='*' --no-hinting --desubroutinize

- 커버리지: 한글 2,780자 + 라틴/숫자/기호 (직전 Pretendard 서브셋과 동일하게 맞춤)
- 용량: Light 133 + Medium 144 + Bold 139 = **417KB**
- 원본은 한글 11,172자 전체를 담지만 전체 유지 시 1,025KB 라 서브셋했다
- 굵기가 Light/Medium/Bold 셋뿐이고 **Regular(400)가 없다** →
  기본 본문(400)은 Medium 이 받는다. `src/app/layout.tsx` 참조
- 악센트 라틴(À Á Â…)은 **원본에 아예 없어** fallback 이 받는다

## 남겨둔 것 — Pretendard

직전에 쓰던 폰트. 하이브리드(제목만 Gmarket)나 복귀를 대비해 남겨 두었다.
`next/font/local` 은 참조된 파일만 번들하므로 배포 용량에는 영향이 없다.
방향이 확정되면 지운다.
