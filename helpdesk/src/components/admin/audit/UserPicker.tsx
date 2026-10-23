import { listUsers } from '@/api/users';
import { Combobox, type ComboOption } from '@/components/ui';

export interface UserPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  'aria-label': string;
  placeholder?: string;
  /** Só clientes (titulares de pedidos LGPD). */
  clientsOnly?: boolean;
  className?: string;
}

async function load(query: string, clientsOnly: boolean): Promise<ComboOption[]> {
  const users = await listUsers({ query: query.trim() || undefined, role: clientsOnly ? 'end_user' : undefined });
  return users.slice(0, 30).map((u) => ({ value: u.id, label: u.name, description: u.email }));
}

/** Seletor de pessoa com busca no servidor/diretório, para filtros e pedidos. */
export function UserPicker({ value, onChange, placeholder = 'Qualquer pessoa', clientsOnly = false, className, ...rest }: UserPickerProps) {
  return <Combobox value={value} onValueChange={onChange} loadOptions={(q) => load(q, clientsOnly)} placeholder={placeholder} searchPlaceholder="Buscar por nome ou e-mail" emptyText="Ninguém encontrado" clearable className={className} aria-label={rest['aria-label']} />;
}
