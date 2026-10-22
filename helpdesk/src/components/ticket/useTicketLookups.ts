import { useEffect, useState } from 'react';
import { metaApi, orgsApi } from '@/api';
import type { Group, Org, TicketField } from '@/types/domain';

function makeCachedList<T>(load: () => Promise<T[]>) {
  let cache: T[] | null = null;
  const reset = () => {
    cache = null;
  };
  const useList = (): T[] => {
    const [list, setList] = useState<T[]>(() => cache ?? []);
    useEffect(() => {
      if (cache) return undefined;
      let alive = true;
      load()
        .then((l) => {
          cache = l;
          if (alive) setList(l);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []);
    return list;
  };
  return { useList, reset };
}

const groups = makeCachedList<Group>(() => metaApi.listGroups());
const orgs = makeCachedList<Org>(() => orgsApi.listOrgs());
const fields = makeCachedList<TicketField>(() => metaApi.listFields());

export const useGroups = groups.useList;
export const useOrgs = orgs.useList;
export const useTicketFields = fields.useList;

/** Só para testes: o banco foi reiniciado. */
export function resetTicketLookups(): void {
  groups.reset();
  orgs.reset();
  fields.reset();
}
