"use client";

import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/batches": "Batchevi",
  "/orders": "Narudžbe",
  "/locations": "SKU Lokacije",
  "/users": "Korisnici",
};

export function AdminHeader({ userName }: { userName: string }) {
  const pathname = usePathname();

  const pageTitle = Object.entries(pageTitles).find(([key]) =>
    pathname.startsWith(key)
  )?.[1] ?? "Admin";

  const today = new Date().toLocaleDateString("hr-HR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <header className="h-12 border-b border-ds-border bg-white px-7 flex items-center justify-between sticky top-0 z-20">
      <span className="text-ds-13 font-semibold text-ds-text-primary tracking-tight">
        {pageTitle}
      </span>

      <div className="flex items-center gap-4">
        <span className="text-ds-11 text-ds-text-muted uppercase tracking-wide hidden sm:block">
          {today}
        </span>
        <div className="flex items-center gap-2.5">
          <span className="text-ds-12 font-medium text-ds-text-secondary">
            {userName}
          </span>
          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
            <span className="text-ds-10 font-semibold text-white">
              {userName.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
