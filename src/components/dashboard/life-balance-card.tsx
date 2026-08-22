"use client";

import type { LifeBalanceInsight } from "@/types";
import { Card } from "@/components/ui/card";

interface LifeBalanceCardProps {
  balance: LifeBalanceInsight | null;
}

export function LifeBalanceCard({ balance }: LifeBalanceCardProps) {
  return (
    <Card as="section" padded>
      <p className="text-sm text-foreground/70 mb-2">인생균형 흐름</p>
      {balance?.focusArea && (
        <p className="text-sm text-foreground/80">
          이번 시즌 손이 많이 가는 영역: {balance.focusArea}
        </p>
      )}
      {balance?.neglectedArea && (
        <p className="text-sm text-foreground/80 mt-1">
          최근 놓치고 있는 영역: {balance.neglectedArea}
        </p>
      )}
      {balance?.steadyArea && (
        <p className="text-sm text-foreground/80 mt-1">
          작게라도 계속 이어가는 영역: {balance.steadyArea}
        </p>
      )}
      <p className="text-sm text-foreground/80">
        {balance?.message ??
          "아직 데이터가 모이고 있어요. 조금만 더 사용하면 패턴이 보일 거예요."}
      </p>
    </Card>
  );
}
