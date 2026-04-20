"use client";

import { cn } from "@/lib/utils";

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentControlProps<T>) {
  return (
    <div className={cn("flex rounded-lg border border-foreground/20 p-0.5 gap-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 min-h-[40px] rounded-md px-3 py-2 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-foreground text-background"
              : "hover:bg-foreground/5"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
