"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const prevRef = useRef(pathname);

  // Hide when navigation completes (pathname changed).
  useEffect(() => {
    if (pathname !== prevRef.current) {
      prevRef.current = pathname;
      setActive(false);
    }
  }, [pathname]);

  // Start on any internal link click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (!a || a.getAttribute("target") === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (
        !href ||
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:")
      )
        return;
      setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] h-0.5 overflow-hidden bg-skip/20">
      <div className="nav-progress h-full w-1/3 bg-skip" />
    </div>
  );
}
