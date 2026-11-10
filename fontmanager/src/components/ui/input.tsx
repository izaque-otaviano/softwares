import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn("h-[26px] w-full rounded-[6px] bg-control px-2 text-[13px] text-label shadow-control placeholder:text-label-3 focus:outline-[3px] focus:outline-offset-0 focus:outline-accent/50 focus:outline", className)}
    {...props}
  />
));
Input.displayName = "Input";

/** Pop-up button (NSPopUpButton): select nativo com a seta dupla do macOS. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <span className={cn("relative inline-flex", className)}>
    <select
      ref={ref}
      className="h-[26px] w-full appearance-none rounded-[6px] bg-control pl-2.5 pr-7 text-[13px] text-label shadow-control focus-visible:outline-[3px] focus-visible:outline-accent/50"
      {...props}
    >
      {children}
    </select>
    <ChevronsUpDown className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-label-2" />
  </span>
));
Select.displayName = "Select";
