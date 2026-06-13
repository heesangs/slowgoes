// Supabase 무료 플랜 자동 일시정지 방지용 keep-alive 엔드포인트.
// Vercel Cron이 주기적으로 호출하며, 실제 DB 쿼리를 1회 실행해 프로젝트를 활성 상태로 유지한다.
// 참고: auth/health 같은 단순 핑은 활동으로 인정되지 않을 수 있어, Postgres에 닿는 쿼리를 사용한다.
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// 매번 실제 실행되도록 캐시 비활성화
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // CRON_SECRET이 설정돼 있으면 외부의 무단 호출을 차단한다.
  // (Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 붙인다.)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 쿠키/세션 불필요한 가벼운 stateless 클라이언트
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 실제 DB에 닿는 최소 쿼리. RLS로 행이 0개여도 쿼리 자체는 Postgres에서 실행되어 활동으로 집계된다.
    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" });

    if (error) {
      // 쿼리는 실패했지만 DB까지는 도달함 — 원인 파악을 위해 로깅 후 에러 응답
      console.error("[keep-alive] Supabase 쿼리 실패:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[keep-alive] 예외 발생:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
