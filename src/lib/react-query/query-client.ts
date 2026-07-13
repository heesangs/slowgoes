import { QueryClient, isServer } from "@tanstack/react-query";

// 브라우저 싱글톤 QueryClient.
//
// 클라이언트 캐시를 네비게이션 전반에 유지해 "재방문 즉시 표시"를 구현한다.
// - staleTime 60s: 재방문 시 캐시를 즉시 보여주고, 60초 지났으면 백그라운드 갱신.
// - gcTime 30분: 세션 내 미사용 캐시 유지(자주 오가는 화면이 계속 즉시).
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (isServer) {
    // 서버: 요청마다 새 클라이언트
    return makeQueryClient();
  }
  // 브라우저: 최초 1회만 생성 → 네비게이션 간 캐시 유지
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
