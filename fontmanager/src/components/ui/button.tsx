import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botões no estilo AppKit:
 *  - push: botão padrão com borda fina (secundário)
 *  - primary: ação principal — pílula preenchida na cor de destaque (só "Ativar" usa)
 *  - plain: sem borda, para ícones na barra de ferramentas e ações discretas
 */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background,opacity,transform] disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        push: "rounded-[6px] bg-control text-label shadow-control active:bg-fill",
        primary: "rounded-full bg-accent text-accent-contrast shadow-[0_1px_2px_rgb(0_0_0/0.15)] hover:brightness-110 active:brightness-95",
        plain: "rounded-[6px] text-label-2 hover:bg-fill-2 hover:text-label active:bg-fill",
        destructive: "rounded-[6px] bg-control text-red shadow-control active:bg-fill",
      },
      size: {
        default: "h-[26px] px-3 text-[13px] [&_svg]:size-[15px]",
        sm: "h-[22px] px-2.5 text-[12px] [&_svg]:size-[13px]",
        lg: "h-[30px] px-4 text-[13px] [&_svg]:size-4",
        icon: "size-7 [&_svg]:size-[17px]",
        "icon-sm": "size-6 [&_svg]:size-[15px]",
      },
    },
    defaultVariants: { variant: "push", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

/** Controle segmentado (NSSegmentedControl). */
export function Segmented<T extends string>({ value, onChange, items, label, className }: {
  value: T; onChange: (v: T) => void; label: string; className?: string;
  items: { value: T; label?: string; icon?: React.ReactNode; title?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-[26px] items-center rounded-[7px] bg-fill p-[2px]", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="radio"
          aria-checked={value === it.value}
          aria-label={it.label ?? it.title}
          title={it.title ?? it.label}
          onClick={() => onChange(it.value)}
          className={cn(
            "flex h-full items-center justify-center gap-1 rounded-[5px] px-2.5 text-[12px] font-medium text-label-2 [&_svg]:size-[15px]",
            value === it.value && "bg-control text-label shadow-control",
          )}
        >
          {it.icon}{it.icon && it.label ? <span className="hidden sm:inline">{it.label}</span> : it.label}
        </button>
      ))}
    </div>
  );
}
