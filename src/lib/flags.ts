// Feature flags
// - 기본값은 출시 상태(true)
// - 서버에서는 FF_* 우선, 없으면 NEXT_PUBLIC_FF_* 사용
// - <FLAG>_ROLLOUT (0~100) 값을 주면 사용자 ID 해시 기반 점진 공개 가능
// - bool 플래그(FF_*)를 명시하면 rollout 값보다 우선 적용됨

export type FeatureFlag = "onboarding_v2" | "dashboard_v2";

const TRUE_VALUES = new Set(["1", "true", "t", "yes", "y", "on"]);
const FALSE_VALUES = new Set(["0", "false", "f", "no", "n", "off"]);

const FEATURE_FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  onboarding_v2: true,
  dashboard_v2: true,
};

const FEATURE_FLAG_ENV_KEYS: Record<FeatureFlag, readonly string[]> = {
  onboarding_v2: ["FF_ONBOARDING_V2", "NEXT_PUBLIC_FF_ONBOARDING_V2"],
  dashboard_v2: ["FF_DASHBOARD_V2", "NEXT_PUBLIC_FF_DASHBOARD_V2"],
};

const FEATURE_FLAG_ROLLOUT_ENV_KEYS: Record<FeatureFlag, readonly string[]> = {
  onboarding_v2: ["FF_ONBOARDING_V2_ROLLOUT", "NEXT_PUBLIC_FF_ONBOARDING_V2_ROLLOUT"],
  dashboard_v2: ["FF_DASHBOARD_V2_ROLLOUT", "NEXT_PUBLIC_FF_DASHBOARD_V2_ROLLOUT"],
};

function parseBoolean(rawValue: string | undefined): boolean | null {
  if (!rawValue) return null;
  const normalized = rawValue.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

function parseRolloutPercent(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.round(parsed);
  return Math.max(0, Math.min(100, normalized));
}

function getFlagRawValue(flag: FeatureFlag): string | undefined {
  const keys = FEATURE_FLAG_ENV_KEYS[flag];
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function getRolloutRawValue(flag: FeatureFlag): string | undefined {
  const keys = FEATURE_FLAG_ROLLOUT_ENV_KEYS[flag];
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function hashSeed(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function isUserInRollout(userId: string, percent: number) {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  const bucket = hashSeed(userId) % 100;
  return bucket < percent;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const explicit = parseBoolean(getFlagRawValue(flag));
  if (explicit !== null) return explicit;

  const rollout = parseRolloutPercent(getRolloutRawValue(flag));
  if (rollout !== null) return rollout >= 100;

  return FEATURE_FLAG_DEFAULTS[flag];
}

export function isFeatureEnabledForUser(flag: FeatureFlag, userId: string): boolean {
  const explicit = parseBoolean(getFlagRawValue(flag));
  if (explicit !== null) return explicit;

  const rollout = parseRolloutPercent(getRolloutRawValue(flag));
  if (rollout !== null) {
    return isUserInRollout(userId, rollout);
  }

  return FEATURE_FLAG_DEFAULTS[flag];
}

export function getFeatureFlags() {
  return {
    onboarding_v2: isFeatureEnabled("onboarding_v2"),
    dashboard_v2: isFeatureEnabled("dashboard_v2"),
  } as const;
}

export function getFeatureFlagsForUser(userId: string) {
  return {
    onboarding_v2: isFeatureEnabledForUser("onboarding_v2", userId),
    dashboard_v2: isFeatureEnabledForUser("dashboard_v2", userId),
  } as const;
}

export const featureFlags = {
  onboardingV2: (userId?: string) =>
    userId ? isFeatureEnabledForUser("onboarding_v2", userId) : isFeatureEnabled("onboarding_v2"),
  dashboardV2: (userId?: string) =>
    userId ? isFeatureEnabledForUser("dashboard_v2", userId) : isFeatureEnabled("dashboard_v2"),
};
