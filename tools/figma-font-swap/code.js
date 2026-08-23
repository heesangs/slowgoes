// slowgoes — 텍스트 스타일 폰트 일괄 교체
//
// 이 파일이 필요한 이유: Figma MCP 연결은 **로컬 설치 폰트에 접근하지 못한다.**
// 변수 쓰기는 되지만 loadFontAsync 는 클라우드 폰트(Google Fonts)만 성공한다 —
// 설치가 확실한 Apple SD Gothic Neo 조차 실패한다. 그래서 폰트 교체만은
// 데스크톱 Figma 안에서 돌려야 한다.
//
// 실행: Plugins → Development → Import plugin from manifest… → 이 폴더의 manifest.json
//
// 창이 열리면 바뀔 내용을 먼저 보여주고, [적용하기] 를 눌러야 실제로 바뀐다.
// 되돌리려면 아래 FROM / TO_PATTERN 을 맞바꾸고 STYLE_MAP 을 역방향으로 둔다.
// 다만 Regular→Medium 은 정보를 잃는 매핑이라 정확한 복구는 Figma 버전 히스토리를 쓴다.

const FROM = "Pretendard";
const TO_PATTERN = /g\s*market/i; // 실제 패밀리 표기를 추측하지 않고 찾는다

// Gmarket Sans 에는 Regular(400)가 없다. 코드(src/app/layout.tsx)에서 기본 본문을
// Medium 이 받게 한 것과 같은 규칙을 쓴다.
const STYLE_MAP = { Regular: "Medium", Medium: "Medium", Bold: "Bold" };

const UI = `
<style>
  body { font: 12px/1.55 -apple-system, "Apple SD Gothic Neo", sans-serif;
         margin: 0; padding: 14px; color: #1a1a1a; }
  h2 { font-size: 13px; margin: 0 0 8px; }
  .box { border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px;
         height: 300px; overflow: auto; background: #fafafa;
         font-family: ui-monospace, Menlo, monospace; font-size: 11px; white-space: pre-wrap; }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  button { flex: 1; padding: 9px; border-radius: 6px; border: 1px solid #d0d0d0;
           background: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
  button.go { background: #0d99ff; border-color: #0d99ff; color: #fff; }
  button:disabled { opacity: .4; cursor: default; }
  .sum { margin: 0 0 10px; font-size: 12px; }
  .warn { color: #b4530a; }
  .ok { color: #0a7d4b; }
</style>
<h2>텍스트 스타일 폰트 교체</h2>
<p class="sum" id="sum">확인하는 중…</p>
<div class="box" id="log"></div>
<div class="row">
  <button id="close">닫기</button>
  <button id="apply" class="go" disabled>적용하기</button>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  onmessage = (e) => {
    const m = e.data.pluginMessage;
    if (!m) return;
    $('sum').innerHTML = m.summary;
    $('log').textContent = m.detail;
    $('apply').disabled = !m.canApply;
    if (m.done) { $('apply').style.display = 'none'; $('close').textContent = '완료 — 닫기'; }
  };
  $('apply').onclick = () => {
    $('apply').disabled = true;
    $('apply').textContent = '적용 중…';
    parent.postMessage({ pluginMessage: { type: 'apply' } }, '*');
  };
  $('close').onclick = () => parent.postMessage({ pluginMessage: { type: 'close' } }, '*');
</script>
`;

figma.showUI(UI, { width: 460, height: 440 });

let plan = null; // { family, targets, skipped, needed }

const send = (summary, detail, canApply, done) =>
  figma.ui.postMessage({ summary, detail, canApply: !!canApply, done: !!done });

async function buildPlan() {
  const fonts = await figma.listAvailableFontsAsync();
  const matched = fonts.filter((f) => TO_PATTERN.test(f.fontName.family));

  if (matched.length === 0) {
    const candidates = [...new Set(fonts.map((f) => f.fontName.family))]
      .filter((f) => /[가-힣]/.test(f) || /sans|gothic|square/i.test(f))
      .slice(0, 40);
    send(
      '<span class="warn">✕ Gmarket Sans 를 찾지 못했습니다.</span>',
      "맥에 설치했는데도 안 보이면 Figma 를 완전히 종료했다가 다시 켜 주세요.\n" +
        "(설치된 폰트 목록은 Figma 가 시작할 때 한 번만 읽습니다)\n\n" +
        "이름이 비슷한 후보:\n  " + candidates.join("\n  "),
      false
    );
    return;
  }

  const family = matched[0].fontName.family;
  const available = new Set(matched.map((f) => f.fontName.style));
  const needed = [...new Set(Object.values(STYLE_MAP))];
  const missing = needed.filter((s) => !available.has(s));

  if (missing.length) {
    send(
      '<span class="warn">✕ 필요한 굵기가 없습니다.</span>',
      `찾은 폰트: ${family}\n있는 굵기: ${[...available].join(", ")}\n없는 굵기: ${missing.join(", ")}\n\n` +
        "code.js 의 STYLE_MAP 을 위 목록에 맞게 고친 뒤 다시 실행하세요.",
      false
    );
    return;
  }

  const styles = await figma.getLocalTextStylesAsync();
  const targets = [];
  const skipped = [];

  for (const s of styles) {
    if (s.fontName.family !== FROM) {
      skipped.push(`${s.name}  —  ${s.fontName.family} (대상 아님)`);
      continue;
    }
    const to = STYLE_MAP[s.fontName.style];
    if (!to) {
      skipped.push(`${s.name}  —  ${s.fontName.style} (STYLE_MAP 에 없음)`);
      continue;
    }
    targets.push({ style: s, from: s.fontName.style, to });
  }

  plan = { family, targets, skipped, needed };

  const byMap = {};
  for (const t of targets) {
    const k = `${FROM} ${t.from}  →  ${family} ${t.to}`;
    byMap[k] = (byMap[k] || 0) + 1;
  }

  const detail =
    "바뀔 내용 (아직 아무것도 바꾸지 않았습니다)\n" +
    "─".repeat(46) + "\n" +
    Object.entries(byMap).map(([k, v]) => `  ${v}개   ${k}`).join("\n") +
    "\n\n대상 스타일\n" + "─".repeat(46) + "\n" +
    targets.map((t) => `  ${t.style.name}`).join("\n") +
    (skipped.length
      ? "\n\n건너뛰는 스타일\n" + "─".repeat(46) + "\n" + skipped.map((s) => `  ${s}`).join("\n")
      : "");

  send(
    `찾은 폰트 <b>${family}</b> · 바꿀 스타일 <b>${targets.length}개</b>` +
      (skipped.length ? ` · 건너뜀 ${skipped.length}개` : ""),
    detail,
    targets.length > 0
  );
}

async function apply() {
  if (!plan) return;
  const { family, targets, needed, skipped } = plan;

  // face 를 전부 먼저 로드한다. 하나라도 실패하면 아무것도 바꾸지 않는다
  // (반쯤 바뀐 상태를 만들지 않기 위해).
  try {
    for (const style of needed) await figma.loadFontAsync({ family, style });
  } catch (e) {
    send('<span class="warn">✕ 폰트 로드 실패 — 아무것도 바꾸지 않았습니다.</span>',
      String((e && e.message) || e), false, true);
    return;
  }

  let ok = 0;
  const failed = [];
  for (const t of targets) {
    try {
      t.style.fontName = { family, style: t.to };
      ok++;
    } catch (e) {
      failed.push(`${t.style.name} — ${(e && e.message) || e}`);
    }
  }

  const detail =
    `${ok}개 스타일을 ${family} 로 바꿨습니다.\n` +
    (failed.length ? `\n실패 ${failed.length}개\n` + failed.map((f) => "  " + f).join("\n") + "\n" : "") +
    (skipped.length ? `\n건너뛴 ${skipped.length}개\n` + skipped.map((s) => "  " + s).join("\n") + "\n" : "") +
    "\n※ 폰트를 스타일 없이 직접 지정한 텍스트는 바뀌지 않습니다.\n" +
    "   Figma 의 Text → Fonts 패널에서 따로 정리하세요.";

  send(
    failed.length
      ? `<span class="warn">${ok}개 완료 · ${failed.length}개 실패</span>`
      : `<span class="ok">✓ ${ok}개 스타일을 ${family} 로 바꿨습니다.</span>`,
    detail, false, true
  );
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "apply") await apply();
  else if (msg.type === "close") figma.closePlugin();
};

buildPlan();
