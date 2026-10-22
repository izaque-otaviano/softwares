import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('arquitetura da camada de API', () => {
  const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));

  it('nada fora de src/api importa mock, db ou dados de exemplo', () => {
    const offenders = files
      .filter((f) => !relative(SRC, f).startsWith('api/'))
      .filter((f) => /from '(@\/api\/mock|@\/api\/db|@\/api\/delay|@\/mocks)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('só as fachadas e o stub real tocam em api/mock dentro de src/api', () => {
    const offenders = files
      .filter((f) => relative(SRC, f).startsWith('api/') && !relative(SRC, f).startsWith('api/mock/'))
      .filter((f) => /from '\.\.?\/mock\//.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
      .filter((f) => !/^api\/(real\/[a-z]+|[a-z]+|mock)\.ts$/.test(f));
    expect(offenders).toEqual([]);
  });

  it('ME_ID não existe mais fora do mock', () => {
    const offenders = files
      .filter((f) => !relative(SRC, f).startsWith('api/mock/'))
      .filter((f) => /\bME_ID\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
