"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const prevRef = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    setActive(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Hide when navigation completes (pathname changed).
  useEffect(() => {
    if (pathname !== prevRef.current) {
      prevRef.current = pathname;
      dismiss();
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start on any internal link click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (!a || a.getAttribute("target") === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:"))
        return;

      // Don't activate when the link points to the current page.
      const destPath = href.split("?")[0].split("#")[0];
      if (destPath === pathname || destPath === "") return;

      setActive(true);
      // Safety net: auto-dismiss after 8 s in case the pathname never changes
      // (e.g. search-param-only navigations, cancelled navigations).
      timerRef.current = setTimeout(dismiss, 8000);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname]); // re-bind when pathname changes so destPath comparison is fresh

  if (!active) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] h-0.5 overflow-hidden bg-skip/20">
      <div className="nav-progress h-full w-1/3 bg-skip" />
    </div>
  );
}
