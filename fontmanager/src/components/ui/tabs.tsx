import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/** Abas como controle segmentado centralizado (padrão de inspetores no macOS). */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("mx-auto flex h-[26px] max-w-full items-center overflow-x-auto rounded-[7px] bg-fill p-[2px]", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("flex h-full shrink-0 items-center whitespace-nowrap rounded-[5px] px-2.5 text-[12px] font-medium text-label-2 data-[state=active]:bg-control data-[state=active]:text-label data-[state=active]:shadow-control", className)}
      {...p}
    />
  );
}
export function TabsContent({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4 outline-none", className)} {...p} />;
}
