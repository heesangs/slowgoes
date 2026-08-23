// slowgoes — 텍스트 스타일 폰트 일괄 교체
//
// 이 파일이 필요한 이유: Figma MCP 연결은 **로컬 설치 폰트에 접근하지 못한다.**
// 변수 쓰기는 되지만 loadFontAsync 는 클라우드 폰트(Google Fonts)만 성공한다 —
// 설치가 확실한 Apple SD Gothic Neo 조차 실패한다. 그래서 폰트 교체만은
// 데스크톱 Figma 안에서 돌려야 한다.
//
// 실행: Plugins → Development → Import plugin from manifest… → 이 폴더의 manifest.json
//
// ── 되돌리려면 ──────────────────────────────────────────────
// 아래 FROM / TO 를 맞바꾸고 STYLE_MAP 을 역방향으로 바꿔 재실행한다.
// 다만 Regular→Medium 은 정보를 잃는 매핑이라(원래 Regular 였는지 Medium 이었는지
// 구분되지 않는다) **정확한 복구는 Figma 버전 히스토리**를 쓰는 편이 낫다.
// ────────────────────────────────────────────────────────────

const FROM = "Pretendard";
const TO_PATTERN = /g\s*market/i; // 실제 패밀리 표기를 추측하지 않고 찾는다

// Gmarket Sans 에는 Regular(400)가 없다. 코드(src/app/layout.tsx)에서 기본 본문을
// Medium 이 받게 한 것과 같은 규칙을 쓴다.
const STYLE_MAP = { Regular: "Medium", Medium: "Medium", Bold: "Bold" };

// 처음에는 true 로 두고 무엇이 바뀔지만 확인한다. 확인 후 false 로 바꿔 재실행.
const DRY_RUN = true;

const log = [];
const say = (s) => { log.push(s); console.log(s); };

(async () => {
  // ── 1. 대상 폰트의 실제 이름 찾기 ────────────────────────
  const fonts = await figma.listAvailableFontsAsync();
  const matched = fonts.filter((f) => TO_PATTERN.test(f.fontName.family));

  if (matched.length === 0) {
    say("❌ Gmarket Sans 를 찾지 못했습니다.");
    say("   맥에 설치했는데도 안 보이면 Figma 를 완전히 종료 후 재실행해 보세요.");
    say("   (설치 폰트 목록은 Figma 시작할 때 한 번만 읽습니다)");
    const kr = [...new Set(fonts.map((f) => f.fontName.family))]
      .filter((f) => /[가-힣]/.test(f) || /sans|gothic|square/i.test(f))
      .slice(0, 30);
    say("   참고 — 이름이 비슷한 후보: " + kr.join(", "));
    figma.closePlugin(log.join("\n"));
    return;
  }

  const family = matched[0].fontName.family;
  const available = new Set(matched.map((f) => f.fontName.style));
  say(`✅ 찾았습니다: "${family}"  [${[...available].join(", ")}]`);

  // 매핑이 가리키는 face 가 실제로 있는지 먼저 본다
  const needed = [...new Set(Object.values(STYLE_MAP))];
  const missing = needed.filter((s) => !available.has(s));
  if (missing.length) {
    say(`❌ "${family}" 에 필요한 굵기가 없습니다: ${missing.join(", ")}`);
    say(`   사용 가능한 굵기: ${[...available].join(", ")}`);
    say("   code.js 의 STYLE_MAP 을 위 목록에 맞게 고친 뒤 다시 실행하세요.");
    figma.closePlugin(log.join("\n"));
    return;
  }

  // ── 2. 대상 스타일 선별 — FROM 폰트를 쓰는 것만 ──────────
  const styles = await figma.getLocalTextStylesAsync();
  const targets = [];
  const skipped = [];

  for (const s of styles) {
    if (s.fontName.family !== FROM) {
      skipped.push(`${s.name}  (${s.fontName.family} — 대상 아님)`);
      continue;
    }
    const to = STYLE_MAP[s.fontName.style];
    if (!to) {
      // 임의로 추측하지 않는다
      skipped.push(`${s.name}  (${s.fontName.style} — STYLE_MAP 에 없음)`);
      continue;
    }
    targets.push({ style: s, from: s.fontName.style, to });
  }

  say(`\n대상 ${targets.length}개 / 건너뜀 ${skipped.length}개 (전체 ${styles.length}개)`);

  // ── 3. DRY RUN — 출력만 ──────────────────────────────────
  if (DRY_RUN) {
    say("\n── 바뀔 내용 (DRY RUN — 아직 아무것도 바꾸지 않았습니다) ──");
    for (const t of targets) {
      say(`  ${t.style.name}\n      ${FROM} ${t.from}  →  ${family} ${t.to}`);
    }
    if (skipped.length) {
      say("\n── 건너뛴 스타일 ──");
      for (const s of skipped) say("  " + s);
    }
    say("\n확인되면 code.js 의 DRY_RUN 을 false 로 바꾸고 다시 실행하세요.");
    figma.closePlugin(log.join("\n"));
    return;
  }

  // ── 4. 적용 — face 를 전부 먼저 로드한다 ─────────────────
  // 하나라도 실패하면 아무것도 바꾸지 않는다(반쯤 바뀐 상태를 만들지 않기 위해).
  try {
    for (const style of needed) {
      await figma.loadFontAsync({ family, style });
    }
  } catch (e) {
    say(`❌ 폰트 로드 실패 — 아무것도 바꾸지 않았습니다.\n   ${e.message || e}`);
    figma.closePlugin(log.join("\n"));
    return;
  }

  let ok = 0;
  const failed = [];
  for (const t of targets) {
    try {
      t.style.fontName = { family, style: t.to };
      ok++;
    } catch (e) {
      failed.push(`${t.style.name} — ${e.message || e}`);
    }
  }

  say(`\n✅ ${ok}개 스타일을 ${family} 로 바꿨습니다.`);
  if (failed.length) {
    say(`⚠️ 실패 ${failed.length}개:`);
    for (const f of failed) say("  " + f);
  }
  if (skipped.length) {
    say(`\n건너뛴 ${skipped.length}개:`);
    for (const s of skipped) say("  " + s);
  }
  say("\n※ 폰트를 스타일 없이 직접 지정한 텍스트는 바뀌지 않습니다.");
  say("   Figma 의 Text → Fonts 패널에서 따로 정리하세요.");

  figma.closePlugin(log.join("\n"));
})();
