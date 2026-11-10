import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/** NSSwitch: trilho cinza, verde-azulado de destaque quando ligado. */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full bg-fill transition-colors data-[state=checked]:bg-accent disabled:opacity-40", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[20px] translate-x-px rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25),0_0_0_0.5px_rgb(0_0_0/0.06)] transition-transform data-[state=checked]:translate-x-[17px]" />
    </SwitchPrimitive.Root>
  );
}
