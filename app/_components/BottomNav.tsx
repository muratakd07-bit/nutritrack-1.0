"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Ana Sayfa", icon: "⌂" },
  { href: "/meals/add", label: "Ekle", icon: "+" },
  { href: "/reports", label: "Raporlar", icon: "▥" },
  { href: "/profile", label: "Profil", icon: "○" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // "/meals/add-photo" da "Ekle" sekmesine aittir.
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}-`);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-around px-2 py-2">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition ${
                active
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
