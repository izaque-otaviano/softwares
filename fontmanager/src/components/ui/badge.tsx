import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      success: "border-success/30 bg-success/10 text-success",
      warning: "border-warning/40 bg-warning/10 text-warning",
      danger: "border-danger/30 bg-danger/10 text-danger",
      primary: "border-primary/30 bg-primary/10 text-primary",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}
