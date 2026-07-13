import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

// 요청당 1회로 dedup되는 인증 사용자 조회.
//
// getSession()은 쿠키에서 세션을 읽으므로 **네트워크 왕복이 없다**(getUser는 매번
// Auth 서버로 검증 요청 → 왕복 발생). 토큰 검증·갱신은 middleware의 getUser()가
// 매 요청에서 담당하므로, 페이지/레이아웃은 검증된 세션을 그대로 신뢰해도 안전하다.
// 데이터 접근 보안은 DB의 RLS(JWT 기반)가 강제하므로 불변.
//
// React cache()로 한 요청 내 중복 호출(layout + page)을 1회로 합친다.
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
});
