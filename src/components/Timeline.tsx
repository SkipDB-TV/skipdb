import { SEGMENT_META } from "@/lib/segment-types";
import { msToClock } from "@/lib/time";
import type { SegmentTypeName } from "@/lib/config";

interface TimelineSegment {
  segmentType: SegmentTypeName;
  startMs: number;
  endMs: number;
}

/**
 * Visual playback timeline: a scrubber bar with colored segment blocks laid out
 * proportionally. This is SkipDB's signature visualization.
 */
export function Timeline({
  segments,
  durationMs,
}: {
  segments: TimelineSegment[];
  durationMs: number | null;
}) {
  // Fall back to the furthest segment end when no duration is known.
  const total =
    durationMs ??
    Math.max(1, ...segments.map((s) => s.endMs), 1) * 1.05;

  return (
    <div className="space-y-2">
      <div className="relative h-10 w-full overflow-hidden rounded-xl border border-white/10 bg-midnight-850">
        {/* tick marks */}
        <div className="absolute inset-0 flex justify-between opacity-30">
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="w-px bg-white/20" />
          ))}
        </div>
        {segments.map((s, i) => {
          const left = (s.startMs / total) * 100;
          const width = Math.max(0.6, ((s.endMs - s.startMs) / total) * 100);
          const meta = SEGMENT_META[s.segmentType];
          return (
            <div
              key={i}
              className={`absolute top-0 h-full ${meta.ring} opacity-80
                transition hover:opacity-100`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${meta.label} · ${msToClock(s.startMs)}–${msToClock(s.endMs)}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-slate-500">
        <span>0:00</span>
        <span>{durationMs ? msToClock(total) : "end"}</span>
      </div>
    </div>
  );
}
