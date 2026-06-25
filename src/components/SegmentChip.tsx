import { SEGMENT_META } from "@/lib/segment-types";
import type { SegmentTypeName } from "@/lib/config";

export function SegmentChip({ type }: { type: SegmentTypeName }) {
  const meta = SEGMENT_META[type];
  return (
    <span className={`chip ${meta.color}`}>
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
