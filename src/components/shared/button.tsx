import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
import React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 text-ds-13 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary: "bg-indigo-600 hover:bg-indigo-700 text-white",
        secondary: "bg-white hover:bg-gray-50 text-ds-text-primary border border-ds-border",
        tertiary: "bg-transparent hover:bg-gray-100 text-ds-text-secondary hover:text-ds-text-primary",
        destructive: "bg-red-600 hover:bg-red-700 text-white",
        success: "bg-emerald-600 hover:bg-emerald-700 text-white",
      },
      size: {
        default: "px-3.5 py-2 rounded text-ds-13",
        sm: "px-2.5 py-1.5 rounded text-ds-12",
        lg: "px-5 py-2.5 rounded text-ds-14",
        icon: "p-2 rounded",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);

Button.displayName = "Button";
