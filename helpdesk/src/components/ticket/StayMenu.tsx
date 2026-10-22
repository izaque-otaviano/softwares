import { ChevronDown } from 'lucide-react';
import { Button, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import { useFormEntry, useFormStore } from './formStore';

/** Menu "Permanecer no ticket / Fechar aba": o que fazer depois de enviar. */
export function StayMenu({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  if (!entry) return null;
  const stay = entry.stayOnTicket;
  const set = (value: boolean) => useFormStore.getState().setStayOnTicket(ticketKey, value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" trailingIcon={<ChevronDown aria-hidden className="h-4 w-4" />}>
          {stay ? 'Permanecer no ticket' : 'Fechar aba'}
        </Button>
      </MenuTrigger>
      <MenuContent side="top" align="end">
        <MenuItem checked={!stay} onSelect={() => set(false)}>
          Fechar aba
        </MenuItem>
        <MenuItem checked={stay} onSelect={() => set(true)}>
          Permanecer no ticket
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
