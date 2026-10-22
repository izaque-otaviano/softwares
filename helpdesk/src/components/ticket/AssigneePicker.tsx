import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { Avatar } from '@/components/ui';
import { fieldBoxSelf } from '@/components/ui/fieldUtils';
import { OPTION_ACTIVE_CMDK } from '@/components/ui/optionStyles';
import { cn } from '@/lib/cn';
import type { Group, User } from '@/types/domain';

export interface AssigneeValue {
  groupId: string;
  assigneeId: string | null;
}

export interface AssigneePickerProps {
  value: AssigneeValue;
  onChange: (value: AssigneeValue) => void;
  groups: Group[];
  users: Map<string, User>;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

const ITEM = cn('hover:bg-hover flex h-8 w-full items-center gap-2 rounded-xs px-2 text-left text-sm text-fg outline-none focus-visible:shadow-none', OPTION_ACTIVE_CMDK.replace(/data-\[selected=true\]/g, 'focus-visible'));

/**
 * Select em 2 níveis: lista de "Grupos ›"; ao escolher um grupo, "‹ Grupos", "Atribuir a {grupo}" e os agentes dele (✓ no atual).
 */
export const AssigneePicker = forwardRef<HTMLButtonElement, AssigneePickerProps>(function AssigneePicker(
  { value, onChange, groups, users, invalid, disabled, ...aria },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<string | null>(null);
  const group = groups.find((g) => g.id === value.groupId);
  const agent = value.assigneeId ? users.get(value.assigneeId) : undefined;
  const label = agent ? `${group ? `${group.name} / ` : ''}${agent.name}` : (group?.name ?? '');
  const levelGroup = groups.find((g) => g.id === level);

  const pick = (next: AssigneeValue) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setLevel(null);
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          {...aria}
          className={cn('flex h-8 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm focus-visible:outline-none', fieldBoxSelf({ invalid, disabled }))}
        >
          <span className={cn('min-w-0 flex-1 truncate', !label && 'text-fg-muted')}>{label || '—'}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          role="menu"
          aria-label="Atribuir a"
          className="anim-pop-in z-[80] max-h-72 w-[var(--radix-popover-trigger-width)] min-w-56 overflow-y-auto rounded border border-line bg-surface p-1 text-sm text-fg shadow-menu focus-visible:outline-none"
        >
          {levelGroup ? (
            <>
              <button type="button" role="menuitem" className={ITEM} onClick={() => setLevel(null)}>
                <ChevronLeft aria-hidden="true" className="size-4 text-fg-muted" />
                <span className="font-semibold">Grupos</span>
              </button>
              <div role="separator" className="my-1 h-px bg-line" />
              <button type="button" role="menuitem" className={ITEM} onClick={() => pick({ groupId: levelGroup.id, assigneeId: null })}>
                <span className="min-w-0 flex-1 truncate">Atribuir a {levelGroup.name}</span>
                {value.groupId === levelGroup.id && !value.assigneeId ? <Check aria-label="Atual" className="size-4 text-action" /> : null}
              </button>
              {levelGroup.agentIds.map((id) => {
                const u = users.get(id);
                if (!u) return null;
                const current = value.assigneeId === id;
                return (
                  <button key={id} type="button" role="menuitem" className={ITEM} onClick={() => pick({ groupId: levelGroup.id, assigneeId: id })}>
                    <Avatar name={u.name} size={20} decorative />
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    {current ? <Check aria-label="Atual" className="size-4 text-action" /> : null}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <div className="px-2 py-1 text-xs font-semibold text-fg-muted">Grupos</div>
              {groups.map((g) => (
                <button key={g.id} type="button" role="menuitem" className={ITEM} onClick={() => setLevel(g.id)}>
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />
                </button>
              ))}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});
