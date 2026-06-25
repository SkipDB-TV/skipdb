import type { SegmentTypeName } from "./config";

export const SEGMENT_META: Record<
  SegmentTypeName,
  { label: string; color: string; ring: string; icon: string; desc: string }
> = {
  intro: {
    label: "Intro",
    color: "text-skip-bright bg-skip/15 border border-skip/30",
    ring: "bg-skip",
    icon: "▶",
    desc: "Opening titles / theme song",
  },
  recap: {
    label: "Recap",
    color: "text-signal-bright bg-signal/15 border border-signal/30",
    ring: "bg-signal",
    icon: "↺",
    desc: '"Previously on…"',
  },
  outro: {
    label: "Outro",
    color: "text-amber-300 bg-warn/15 border border-warn/30",
    ring: "bg-warn",
    icon: "■",
    desc: "End credits",
  },
  preview: {
    label: "Preview",
    color: "text-rose-300 bg-danger/15 border border-danger/30",
    ring: "bg-danger",
    icon: "»",
    desc: '"Next time…"',
  },
};

export const SEGMENT_ORDER: SegmentTypeName[] = [
  "intro",
  "recap",
  "outro",
  "preview",
];
