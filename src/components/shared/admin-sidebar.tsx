"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  MapPin,
  ShoppingCart,
  LogOut,
  Users,
  Package,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/batches", label: "Batchevi", icon: Layers },
  { href: "/orders", label: "Narudžbe", icon: ShoppingCart },
  { href: "/locations", label: "Lokacije", icon: MapPin },
  { href: "/users", label: "Korisnici", icon: Users },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-[220px] bg-ds-text-primary flex flex-col border-r border-white/[0.06]">
      <div className="px-5 pt-7 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none tracking-tight">
              Libar Picking
            </p>
            <p className="text-xs text-ds-sidebar-muted leading-none mt-1">
              Admin konzola
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 pl-3 pr-3 py-[9px] rounded text-xs font-medium transition-colors relative",
                isActive
                  ? "bg-white/[0.08] text-white before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:bg-indigo-500 before:rounded-full"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
              )}
            >
              <item.icon className={cn("w-[16px] h-[16px] shrink-0", isActive ? "text-indigo-400" : "")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pt-3 pb-6 border-t border-white/[0.06] shrink-0">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 px-3 py-[9px] rounded text-xs font-medium text-ds-sidebar-muted hover:text-white hover:bg-white/[0.04] transition-colors w-full cursor-pointer"
        >
          <LogOut className="w-[16px] h-[16px]" />
          Odjava
        </button>
      </div>
    </aside>
  );
}
