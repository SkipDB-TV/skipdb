import Link from "next/link";
import Image from "next/image";

export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : "text-xl";
  const px = size === "lg" ? 40 : 32;
  return (
    <Link href="/" className="group inline-flex items-center gap-2">
      <Image
        src="/skipdb_256.png"
        alt=""
        width={px}
        height={px}
        className="rounded-lg shadow-glow transition group-hover:scale-105"
        aria-hidden
      />
      <span className={`font-bold tracking-tight ${text}`}>
        Skip<span className="text-skip">DB</span>
      </span>
    </Link>
  );
}
