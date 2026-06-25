import Link from "next/link";

export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : "text-xl";
  return (
    <Link href="/" className="group inline-flex items-center gap-2">
      <span
        className="grid h-8 w-8 place-items-center rounded-lg bg-skip text-midnight-950
          font-bold shadow-glow transition group-hover:scale-105"
        aria-hidden
      >
        ⏭
      </span>
      <span className={`font-bold tracking-tight ${text}`}>
        Skip<span className="text-skip">DB</span>
      </span>
    </Link>
  );
}
