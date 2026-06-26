"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : "text-xl";
  const px = size === "lg" ? 40 : 32;
  const isHome = usePathname() === "/";

  const inner = (
    <>
      <Image
        src="/skipdb_256.png"
        alt="SkipDB"
        width={px}
        height={px}
        className="rounded-lg shadow-glow transition group-hover:scale-105"
      />
      <span className={`font-bold tracking-tight ${text}`}>
        Skip<span className="text-skip">DB</span>
      </span>
    </>
  );

  if (isHome) {
    return <span className="group inline-flex items-center gap-2">{inner}</span>;
  }

  return (
    <Link href="/" className="group inline-flex items-center gap-2">
      {inner}
    </Link>
  );
}
