import { useEffect, useState } from 'react';
import { usersApi } from '@/api';
import type { User } from '@/types/domain';

let cache: Map<string, User> | null = null;

/** Só para testes: o banco foi reiniciado. */
export function resetDirectoryCache(): void {
  cache = null;
}

/** Usuários (solicitantes e agentes) por id; carrega uma vez e reaproveita. */
export function useDirectory(): Map<string, User> {
  const [users, setUsers] = useState<Map<string, User>>(() => cache ?? new Map());
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    usersApi
      .listUsers()
      .then((list) => {
        cache = new Map(list.map((u) => [u.id, u]));
        if (alive) setUsers(cache);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return users;
}
