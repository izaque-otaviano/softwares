import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-px text-[11px] font-medium", {
  variants: {
    tone: {
      neutral: "bg-fill-2 text-label-2",
      success: "bg-green/15 text-green",
      warning: "bg-orange/15 text-orange",
      danger: "bg-red/15 text-red",
      primary: "bg-accent/12 text-accent",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}
