import type { LifeCategory } from "@/components/auth/onboarding/constants";
import type { DemoSceneItem, Gender, OnboardingSceneCategory, PersonalityType } from "@/types";

type AgeGroup = "teen" | "young_adult" | "adult";
type PersonalityGroup = "ET" | "IT" | "EF" | "IF";

interface DemoSeed {
  must_do: string[];
  life_scene: string[];
  dont_miss: string[];
}

// MBTI 16가지 → 4그룹 (E/I + T/F 축) 매핑
function toPersonalityGroup(mbti: PersonalityType): PersonalityGroup {
  const ei = mbti[0] as "E" | "I";
  const tf = mbti[2] as "T" | "F";
  return `${ei}${tf}` as PersonalityGroup;
}

const CATEGORY_LABELS: Record<OnboardingSceneCategory["key"], string> = {
  must_do: "꼭 해보고 싶은 것",
  life_scene: "만들고 싶은 삶의 장면",
  dont_miss: "놓치고 싶지 않은 경험",
};

const DEFAULT_SEED: DemoSeed = {
  must_do: [
    "내가 좋아하는 일로 수익 만들기",
    "해외에서 한 달 살아보기",
    "마음이 편한 집 만들기",
    "건강한 생활 루틴 만들기",
    "직접 입력 ✏️",
  ],
  life_scene: [
    "아침이 기다려지는 일상 만들기",
    "좋아하는 사람들과 자주 만나는 삶",
    "나에게 맞는 일의 리듬 찾기",
    "배움이 끊기지 않는 생활 만들기",
    "직접 입력 ✏️",
  ],
  dont_miss: [
    "가족과 오래 기억될 여행 가기",
    "나만의 취미를 꾸준히 이어가기",
    "몸과 마음이 편안한 주말 만들기",
    "고마운 사람에게 마음 전하기",
    "직접 입력 ✏️",
  ],
};

const SEED_BY_PERSONA: Partial<
  Record<AgeGroup, Partial<Record<Gender, Partial<Record<PersonalityGroup, DemoSeed>>>>>
> = {
  teen: {
    male: {
      ET: {
        must_do: [
          "원하는 대학 합격하기",
          "동아리에서 대회 나가기",
          "친구들과 해외여행 가기",
          "운동 루틴으로 몸 만들기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "학교 생활과 공부 균형 잡기",
          "주도적으로 프로젝트 완수하기",
          "친구들과 함께 성장하는 일상",
          "좋아하는 분야로 진로 방향 잡기",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "고등학교 시절 추억 만들기",
          "의미 있는 발표 경험 해보기",
          "좋아하는 친구들과 여행 가기",
          "가족과 대화하는 시간 늘리기",
          "직접 입력 ✏️",
        ],
      },
      IT: {
        must_do: [
          "수학/과학 실력을 확실히 올리기",
          "코딩 프로젝트 하나 완성하기",
          "목표 대학 학과 탐색 마치기",
          "하루 공부 루틴 안정화하기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "혼자 몰입해서 성장하는 공부 습관",
          "장기 목표를 꾸준히 쌓는 일상",
          "차분하게 성취를 만드는 리듬",
          "내가 잘하는 분야를 찾는 과정",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "관심 분야 대회 한 번 도전하기",
          "좋아하는 책 10권 읽기",
          "가까운 사람들과 소소한 추억 남기기",
          "미래 진로 멘토 만나보기",
          "직접 입력 ✏️",
        ],
      },
    },
    female: {
      IF: {
        must_do: [
          "나만의 책 한 권 써보기",
          "심리상담사 자격증 준비하기",
          "좋아하는 분야에서 인정받기",
          "나를 돌보는 루틴 만들기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "마음이 편안한 학교 생활 만들기",
          "의미 있는 관계를 깊게 이어가기",
          "내 감정을 잘 돌보는 하루 만들기",
          "작은 성취를 계속 쌓는 일상",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "소중한 친구와 여행 한 번 가기",
          "부모님과 깊은 대화 나누기",
          "좋아하는 취미를 오래 이어가기",
          "감사한 사람에게 마음 전하기",
          "직접 입력 ✏️",
        ],
      },
    },
  },
  young_adult: {
    female: {
      IF: {
        must_do: [
          "나만의 책 출간하기",
          "혼자 유럽 한 달 살기",
          "심리상담사 자격증 따기",
          "마음 맞는 사람과 결혼하기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "의미 있는 관계를 중심으로 살아가기",
          "배움과 일의 균형이 있는 일상 만들기",
          "내 감정을 지키는 루틴 만들기",
          "나답게 일하고 쉬는 생활 만들기",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "부모님과 여행 가기",
          "친한 사람과 오래 기억될 프로젝트 하기",
          "내가 좋아하는 공간에서 살아보기",
          "꾸준한 운동 습관 만들기",
          "직접 입력 ✏️",
        ],
      },
      EF: {
        must_do: [
          "좋은 동료들과 팀 프로젝트 성공하기",
          "사회에 기여하는 일 시작하기",
          "가족과 따뜻한 가정 만들기",
          "다양한 사람과 연결되는 삶 만들기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "관계가 풍성한 일상 만들기",
          "함께 성장하는 커뮤니티 만들기",
          "일과 사람 사이 균형 잡힌 하루",
          "감사와 연결이 많은 삶",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "친구들과 정기 모임 이어가기",
          "부모님께 고마움 표현하기",
          "오랫동안 기억될 여행 남기기",
          "내가 좋아하는 사람들 챙기기",
          "직접 입력 ✏️",
        ],
      },
    },
    male: {
      IT: {
        must_do: [
          "경제적 기반 만들기",
          "전문성 있는 커리어 구축하기",
          "기술 사이드 프로젝트 출시하기",
          "체력 관리 루틴 확립하기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "집중과 회복 리듬이 있는 일상",
          "깊게 몰입하는 업무 환경 만들기",
          "혼자서도 단단한 생활 시스템 만들기",
          "장기 목표가 분명한 삶",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "가족과의 정기 시간 확보하기",
          "인생에 남을 여행 한 번 가기",
          "멘토와 커리어 대화 나누기",
          "몸과 마음 점검 루틴 만들기",
          "직접 입력 ✏️",
        ],
      },
      ET: {
        must_do: [
          "팀을 이끄는 리더 경험 만들기",
          "사업 아이디어 실제로 실행하기",
          "목표 수입 달성하기",
          "인맥을 확장해 기회 넓히기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "실행력이 살아있는 하루 만들기",
          "일과 관계 둘 다 성장하는 삶",
          "성과와 즐거움이 함께 가는 리듬",
          "주도적으로 선택하는 일상",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "친구들과 도전 프로젝트 해보기",
          "가족과 의미 있는 시간 보내기",
          "새로운 커뮤니티 참여하기",
          "내게 맞는 운동 루틴 만들기",
          "직접 입력 ✏️",
        ],
      },
    },
  },
  adult: {
    male: {
      IT: {
        must_do: [
          "경제적 자유 기반 다지기",
          "가족과 안정적인 생활 설계하기",
          "건강 지표 정상화하기",
          "내 이름으로 남는 일 만들기",
          "직접 입력 ✏️",
        ],
        life_scene: [
          "일과 삶의 리듬이 균형 잡힌 하루",
          "가족과 대화가 많은 저녁 만들기",
          "장기 계획이 차분히 쌓이는 생활",
          "회복 가능한 속도의 커리어 유지",
          "직접 입력 ✏️",
        ],
        dont_miss: [
          "아이와 캠핑 가기",
          "부모님 해외여행 보내드리기",
          "배우자와 정기 데이트 만들기",
          "몸을 위한 정기 검진 챙기기",
          "직접 입력 ✏️",
        ],
      },
    },
  },
};

// 영역(life category)별 시드 — 페르소나와 무관하게 항상 가산되는 핵심 차별화 데이터.
// 카테고리마다 4개 + "직접 입력 ✏️" 자리를 보장하기 위해 4개씩 두고, 호출부에서 직접 입력 옵션을 항상 마지막에 보장.
const LIFE_AREA_SEED: Record<LifeCategory, string[]> = {
  experience: [
    "해외에서 한 달 살아보기",
    "버킷리스트 여행 떠나기",
    "새로운 취미 한 가지 시작하기",
    "꼭 가보고 싶던 공간 방문하기",
  ],
  growth: [
    "새로운 기술 익혀보기",
    "꾸준히 책 읽는 습관 만들기",
    "관심 분야 작은 프로젝트 완성하기",
    "1년 뒤의 나에게 자랑할 일 만들기",
  ],
  // "일/돈"을 흡수 — 커리어·재정·소유 모두 포괄
  possession: [
    "내 집 마련 준비 시작하기",
    "사이드 프로젝트로 수익 만들기",
    "월 생활비 안정화하기",
    "전문성 있는 커리어로 자리잡기",
  ],
  relationship: [
    "부모님과 정기적으로 연락하기",
    "오래된 친구와 시간 만들기",
    "가족과 의미 있는 추억 남기기",
    "고마운 사람에게 마음 전하기",
  ],
  health: [
    "주 3회 운동 루틴 만들기",
    "식단 가볍게 정리하기",
    "수면 시간 안정적으로 확보하기",
    "정기 건강검진 챙기기",
  ],
  inner: [
    "일주일 한 번 회고하기",
    "하루 10분 명상하기",
    "감정 일기 시작하기",
    "마음이 편해지는 나만의 공간 만들기",
  ],
};

function getAgeGroup(age: number): AgeGroup {
  if (age <= 19) return "teen";
  if (age <= 34) return "young_adult";
  return "adult";
}

const DIRECT_INPUT_LABEL = "직접 입력 ✏️";

function dedupeAndLimit(items: string[], limit = 7) {
  const unique: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    if (normalized === DIRECT_INPUT_LABEL) continue; // 항상 마지막에 보장하기 위해 중간엔 제외
    if (unique.includes(normalized)) continue;
    unique.push(normalized);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function getSceneCategoryOptions(): OnboardingSceneCategory[] {
  return [
    { key: "must_do", label: CATEGORY_LABELS.must_do },
    { key: "life_scene", label: CATEGORY_LABELS.life_scene },
    { key: "dont_miss", label: CATEGORY_LABELS.dont_miss },
  ];
}

export function getDemoScenes(params: {
  category: OnboardingSceneCategory["key"];
  /** 6개 UI 카테고리. 영역별 시드를 항상 우선 가산해 카테고리 간 차별화를 보장한다. */
  lifeCategory?: LifeCategory;
  age: number;
  gender: Gender;
  personalityType: PersonalityType;
}): DemoSceneItem[] {
  const ageGroup = getAgeGroup(params.age);
  const category = params.category;

  const group = toPersonalityGroup(params.personalityType);
  const seedFromPersona =
    SEED_BY_PERSONA[ageGroup]?.[params.gender]?.[group]?.[category] ?? [];
  const seedFromLifeArea = params.lifeCategory ? LIFE_AREA_SEED[params.lifeCategory] : [];
  const seedDefault = DEFAULT_SEED[category];

  // 우선순위: 영역별 → 페르소나 → 기본. 끝에 항상 "직접 입력 ✏️" 보장.
  const merged = dedupeAndLimit([...seedFromLifeArea, ...seedFromPersona, ...seedDefault], 7);
  const items: DemoSceneItem[] = merged.map((text, index) => ({
    id: `${category}-${index}`,
    text,
    category,
  }));
  items.push({ id: `${category}-direct`, text: DIRECT_INPUT_LABEL, category });
  return items;
}
