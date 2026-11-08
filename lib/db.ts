import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Conexão com o PostgreSQL do CRM. A string de conexão vem da variável DATABASE_URL
// (configurada no EasyPanel, no VPS, ou no .env.local no PC durante os testes). Nunca no código.
// Na primeira vez, aplica o schema.sql sozinho (idempotente: pode rodar de novo sem quebrar).

let pool: Pool | null = null;
let schemaAplicado = false;

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada. Veja o LEIA-ME.');
  pool = new Pool({
    connectionString: url,
    // Alguns provedores exigem SSL; ligue com DATABASE_SSL=1 se precisar.
    ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

/** Aplica o schema uma vez por processo (cria as tabelas se não existirem). */
export async function ensureSchema(): Promise<void> {
  if (schemaAplicado) return;
  const sql = await readFile(path.join(process.cwd(), 'schema.sql'), 'utf8');
  await getPool().query(sql);
  schemaAplicado = true;
}

/** Consulta com parâmetros ($1, $2, ...). Garante o schema na primeira chamada. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

/** Uma linha só (ou null). */
export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
