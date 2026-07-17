// 일기 로컬 드래프트 (localStorage) — 낙관적 저장의 내구성 담당.
//
// 저장 흐름: 완료 → 드래프트 기록 → 캐시 갱신 → 즉시 이동 → 백그라운드 flush
//   - flush 성공 → clearDiaryDraft(id)
//   - flush 실패/탭 닫힘 → 드래프트 유지 → 다음 목록 진입 시 자동 재전송
// 재전송이 안전한 이유: id가 클라이언트 생성 UUID이고 서버가 upsert하므로 멱등.
//
// 패턴은 src/lib/demo/storage.ts를 따른다 (hasWindow 가드 · 버전 키 · 만료 자동 정리).

const DIARY_DRAFTS_STORAGE_KEY = "slowgoes_diary_drafts_v1";
const DIARY_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DiaryDraft {
  id: string;
  content: string;
  plainText: string;
  savedAt: string;
}

type DraftMap = Record<string, DiaryDraft>;

function hasWindow() {
  return typeof window !== "undefined";
}

function isExpired(savedAt: string): boolean {
  const savedTime = Date.parse(savedAt);
  if (!Number.isFinite(savedTime)) return false;
  return Date.now() - savedTime > DIARY_DRAFT_MAX_AGE_MS;
}

// 읽으면서 만료 항목을 정리해 localStorage 누적을 방지
function readDraftMap(): DraftMap {
  if (!hasWindow()) return {};

  try {
    const raw = localStorage.getItem(DIARY_DRAFTS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as DraftMap;
    if (!parsed || typeof parsed !== "object") return {};

    const alive: DraftMap = {};
    for (const [id, draft] of Object.entries(parsed)) {
      if (draft?.id && draft.savedAt && !isExpired(draft.savedAt)) {
        alive[id] = draft;
      }
    }
    return alive;
  } catch {
    return {};
  }
}

function writeDraftMap(map: DraftMap) {
  if (!hasWindow()) return;
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(DIARY_DRAFTS_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DIARY_DRAFTS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 용량 초과 등 — 드래프트는 보조 안전망이므로 조용히 무시
  }
}

export function saveDiaryDraft(draft: DiaryDraft) {
  const map = readDraftMap();
  map[draft.id] = draft;
  writeDraftMap(map);
}

export function getDiaryDrafts(): DiaryDraft[] {
  return Object.values(readDraftMap());
}

export function clearDiaryDraft(id: string) {
  const map = readDraftMap();
  if (!(id in map)) return;
  delete map[id];
  writeDraftMap(map);
}
