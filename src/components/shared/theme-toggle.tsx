"use client";

import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const options = [
    { value: "light" as const, label: "Svijetlo", icon: Sun },
    { value: "dark" as const, label: "Tamno", icon: Moon },
    { value: "system" as const, label: "Sustav", icon: Monitor },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % options.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + options.length) % options.length;
    } else {
      return;
    }

    e.preventDefault();
    const targetButton = buttonsRef.current[nextIndex];
    if (targetButton) {
      targetButton.focus();
      setTheme(options[nextIndex].value);
    }
  };

  return (
    <div
      className="inline-flex items-center gap-0.5 bg-gray-100 border border-ds-border p-0.5 rounded"
      role="radiogroup"
      aria-label="Izbor teme"
    >
      {options.map((opt, index) => {
        const Icon = opt.icon;
        const isActive = theme === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => { buttonsRef.current[index] = el; }}
            onClick={() => setTheme(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-ds-11 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 select-none",
              isActive
                ? "bg-white text-ds-text-primary"
                : "text-ds-text-muted hover:text-ds-text-secondary"
            )}
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
