import type { View } from '@/types/domain';

const COLS = ['status', 'subject', 'requester', 'createdAt', 'type', 'priority'];

export const views: View[] = [
  {
    id: 'mine',
    name: 'Seus tickets sem resolução',
    conditions: { all: [{ field: 'assignee', operator: 'is', value: 'me' }, { field: 'status_category', operator: 'is_not', value: 'solved' }] },
    groupBy: 'statusCategory',
    columns: COLS,
    countKey: 'mine',
  },
  {
    id: 'unassigned',
    name: 'Tickets não atribuídos',
    conditions: { all: [{ field: 'assignee', operator: 'not_present' }, { field: 'status_category', operator: 'is_not', value: 'solved' }] },
    columns: COLS,
    countKey: 'unassigned',
  },
  {
    id: 'all-unsolved',
    name: 'Todos os tickets sem resolução',
    conditions: { all: [{ field: 'status_category', operator: 'is_not', value: 'solved' }] },
    groupBy: 'statusCategory',
    columns: COLS,
    countKey: 'all-unsolved',
  },
  {
    id: 'recent',
    name: 'Tickets atualizados recentemente',
    conditions: { all: [{ field: 'updated_within_hours', operator: 'less_than', value: '72' }] },
    columns: COLS,
    countKey: 'recent',
  },
  {
    id: 'pending',
    name: 'Tickets pendentes',
    conditions: { all: [{ field: 'status_category', operator: 'is', value: 'pending' }] },
    columns: COLS,
    countKey: 'pending',
  },
  {
    id: 'solved-recent',
    name: 'Tickets resolvidos recentemente',
    conditions: { all: [{ field: 'status_category', operator: 'is', value: 'solved' }, { field: 'updated_within_hours', operator: 'less_than', value: '168' }] },
    columns: COLS,
    countKey: 'solved-recent',
  },
];
