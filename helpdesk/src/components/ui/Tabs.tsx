import * as RadixTabs from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Abas (Radix Tabs): `tablist` / `tab` / `tabpanel`, setas navegam (Home/End também) e a aba ativa recebe
 * a linha de 2px em `action`. Uso:
 *
 *   <Tabs defaultValue="todos">
 *     <TabsList aria-label="Tickets">
 *       <TabsTrigger value="todos" count={12}>Todos</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="todos">...</TabsContent>
 *   </Tabs>
 */

export type TabsProps = ComponentPropsWithoutRef<typeof RadixTabs.Root>;

export const Tabs = forwardRef<ElementRef<typeof RadixTabs.Root>, TabsProps>(function Tabs({ className, ...props }, ref) {
  return <RadixTabs.Root ref={ref} className={cn('flex flex-col', className)} {...props} />;
});

export type TabsListProps = ComponentPropsWithoutRef<typeof RadixTabs.List>;

/** Linha das abas, com a borda inferior `line` sobre a qual a aba ativa desenha seu traço. */
export const TabsList = forwardRef<ElementRef<typeof RadixTabs.List>, TabsListProps>(function TabsList(
  { className, ...props },
  ref,
) {
  return <RadixTabs.List ref={ref} className={cn('flex items-end gap-1 border-b border-line', className)} {...props} />;
});

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof RadixTabs.Trigger> {
  /** Contador exibido entre parênteses depois do rótulo, ex.: "Todos (12)". Aceita 0. */
  count?: number | string;
  children: ReactNode;
}

export const TabsTrigger = forwardRef<ElementRef<typeof RadixTabs.Trigger>, TabsTriggerProps>(function TabsTrigger(
  { className, count, children, ...props },
  ref,
) {
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cn(
        '-mb-px inline-flex h-10 select-none items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm text-fg-muted outline-none',
        'transition-colors duration-100 hover:text-fg focus-visible:shadow-focus',
        'data-[state=active]:border-action data-[state=active]:text-fg',
        'disabled:pointer-events-none disabled:text-fg-subtle',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && count !== '' ? ` (${count})` : null}
    </RadixTabs.Trigger>
  );
});

export type TabsContentProps = ComponentPropsWithoutRef<typeof RadixTabs.Content>;

export const TabsContent = forwardRef<ElementRef<typeof RadixTabs.Content>, TabsContentProps>(function TabsContent(
  { className, ...props },
  ref,
) {
  return <RadixTabs.Content ref={ref} className={cn('outline-none focus-visible:shadow-focus', className)} {...props} />;
});
