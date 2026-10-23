import { Table, type ColumnDef } from '@/components/ui';
import type { RetentionPolicyResult } from '@/types/admin-b';
import { count } from '../audit/format';
import { POLICY_LABEL, policyName } from './policyText';

/** Resultado por tipo de dado de UM ciclo. Em simulação, "Seriam apagados" é só a contagem: nada foi apagado. */
export function PolicyTable({ policies, dryRun, id }: { policies: RetentionPolicyResult[]; dryRun: boolean; id: string }) {
  const order = Object.keys(POLICY_LABEL);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const sorted = [...policies].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
  const columns: ColumnDef<RetentionPolicyResult>[] = [
    {
      id: 'name',
      header: 'Tipo de dado',
      label: 'Tipo de dado',
      width: 240,
      cell: (p) => (
        <span title={POLICY_LABEL[p.key]?.what} className="block truncate">
          {policyName(p.key)}
        </span>
      ),
    },
    { id: 'matched', header: dryRun ? 'Seriam apagados' : 'Elegíveis', label: dryRun ? 'Seriam apagados' : 'Elegíveis', width: 150, align: 'right', cell: (p) => count(p.matched) },
    { id: 'applied', header: 'Apagados', label: 'Apagados', width: 150, align: 'right', cell: (p) => (dryRun ? '0 (simulação)' : count(p.applied)) },
    { id: 'sample', header: 'Amostra', label: 'Amostra', width: 280, cell: (p) => (p.error ? `Erro: ${p.error}` : p.sample.length ? p.sample.join(', ') : '—') },
  ];
  return <Table<RetentionPolicyResult> id={`admin-retention-policies-${dryRun ? 'sim' : 'run'}`} aria-label={`Resultado por tipo de dado, ciclo ${id}`} columns={columns} rows={sorted} getRowId={(p) => p.key} empty={{ title: 'Sem resultados neste ciclo' }} />;
}
