"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { REPO_URL } from "@/lib/branding";

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("commitarc-theme", next ? "dark" : "light");
    setDark(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
    >
      {dark ? "☀ Light" : "🌙 Dark"}
    </button>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const link = (href: string, label: string) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
          active
            ? "bg-sky-500/10 text-sky-400"
            : "text-[var(--text-muted)] hover:text-[var(--text-strong)]"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="no-print sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-[var(--text-strong)]">
          Commit<span className="text-sky-400">Arc</span>
        </Link>
        <div className="flex items-center gap-1">
          {link("/", "New analysis")}
          {link("/campaigns", "Campaigns")}
          {link("/history", "History")}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
          >
            GitHub ↗
          </a>
          <span className="ml-2">
            <ThemeToggle />
          </span>
        </div>
      </div>
    </nav>
  );
}
