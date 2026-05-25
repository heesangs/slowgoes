# BucketSwitcher

헤더 하단에 고정해 모든 메인 화면에서 버킷을 전환하는 가로 스크롤 칩 (IA v2 목표 2).

## 사용 예시

```tsx
<BucketSwitcher buckets={buckets} selectedBucketId={selectedBucketId} basePath="/dashboard" onAddBucket={() => setExploreSheetOpen(true)} />
```

- `selectedBucketId`는 서버 컴포넌트에서 URL `?bucket=` → cookie(`LAST_VIEWED_BUCKET_COOKIE_NAME`) → `buckets[0]` 순으로 해석해 주입한다.
- `onAddBucket`을 넘기면 끝에 `+` 칩이 노출된다 (IA v2 목표 3에서 `ExploreNewSceneSheet` 연결 예정).
- 활성 칩은 자동으로 `scrollIntoView`되며, 칩 클릭은 `router.replace(`${basePath}?bucket=${id}`)`로 라우팅한다.
