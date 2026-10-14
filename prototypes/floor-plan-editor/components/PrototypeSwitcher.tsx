"use client";
// PROTOTYPE — throwaway. A floating bar that switches the ?variant= search param.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function PrototypeSwitcher({ variants }: { variants: { key: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("variant") ?? variants[0].key;
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));

  const go = (d: number) => {
    const next = variants[(idx + d + variants.length) % variants.length];
    const p = new URLSearchParams(params.toString());
    p.set("variant", next.key);
    router.replace(`${pathname}?${p.toString()}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  const v = variants[idx];
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-fuchsia-700 px-4 py-2 text-sm font-medium text-white shadow-xl ring-2 ring-white">
      <button onClick={() => go(-1)} className="px-1 hover:opacity-70">←</button>
      <span>
        {v.key} — {v.name}
      </span>
      <button onClick={() => go(1)} className="px-1 hover:opacity-70">→</button>
    </div>
  );
}
