"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_ITEMS = [
  { href: "/dashboard", label: "dashboard" },
  { href: "/agents", label: "agents" },
  { href: "/bonds", label: "bonds" },
  { href: "/market", label: "market" },
  { href: "/governance", label: "gov" },
  { href: "/portfolio", label: "portfolio" },
  { href: "/zkproof", label: "zkproof" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="cursor-pointer flex items-baseline gap-1.5">
            <span className="font-heading text-base font-bold tracking-tight text-gold">SIB</span>
            <span className="hidden text-2xs text-muted-foreground lg:block">
              sovereign intelligence bonds
            </span>
          </Link>
          <div className="hidden items-center md:flex">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`cursor-pointer px-2.5 py-1 text-xs transition-colors duration-150 ${
                    isActive
                      ? "text-gold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <ConnectButton showBalance={false} />
      </div>
      {/* Mobile nav */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-t px-4 py-1.5 md:hidden">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`cursor-pointer whitespace-nowrap px-2 py-1 text-2xs transition-colors duration-150 ${
                isActive
                  ? "text-gold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
