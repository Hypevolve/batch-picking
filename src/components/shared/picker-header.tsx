"use client";

import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

export function PickerHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 w-full bg-white border-b border-ds-border">
      <div className="flex items-center justify-between max-w-3xl mx-auto px-4 h-12">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-ds-10">LP</span>
          </div>
          <span className="text-ds-13 font-semibold text-ds-text-primary tracking-tight">Libar Picking</span>
        </div>

        <div className="flex items-center gap-3">
          {session?.user?.name && (
            <span className="text-ds-12 font-medium text-ds-text-secondary">{session.user.name}</span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-1.5 rounded text-ds-text-muted hover:text-ds-text-primary hover:bg-gray-100 transition-colors cursor-pointer"
            title="Odjava"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
