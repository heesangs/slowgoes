import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BucketDetailContent } from "@/components/buckets/bucket-detail-content";
import { getStridePlan } from "@/lib/dashboard/queries";
import type { Bucket, LifeArea, StridePlan } from "@/types";

type BucketRow = Bucket & {
  life_area?: Pick<LifeArea, "id" | "name"> | null;
};

interface BucketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BucketDetailPage({ params }: BucketDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: bucketData, error: bucketError } = await supabase
    .from("buckets")
    .select("*, life_area:life_areas(id, name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bucketError || !bucketData) {
    notFound();
  }

  const bucket = bucketData as BucketRow;

  // stride_plan은 실패해도 페이지 자체는 렌더 (없을 수도 있음)
  let stridePlan: StridePlan | null = null;
  let fetchError: string | undefined;
  try {
    stridePlan = await getStridePlan(supabase, user.id, bucket.id);
  } catch {
    fetchError = "발걸음 정보를 불러오는 중 일부 오류가 발생했습니다.";
  }

  return (
    <BucketDetailContent
      bucket={bucket}
      stridePlan={stridePlan}
      fetchError={fetchError}
    />
  );
}
