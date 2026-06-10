import postgres from "postgres";
import { runMigrationsWithSql } from "../../../src/db/migrations";

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const testDatabaseLockId = 20_260_610;

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export function assertLocalTestDatabase(connectionString: string) {
  const url = new URL(connectionString);

  if (!localHosts.has(url.hostname)) {
    throw new Error("TEST_DATABASE_URL must point to a local Postgres instance.");
  }
}

export async function createIsolatedTestSql() {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests.");
  }

  assertLocalTestDatabase(testDatabaseUrl);

  const sql = postgres(testDatabaseUrl, {
    max: 1,
    onnotice: () => undefined,
    prepare: false
  });

  try {
    await sql`select pg_advisory_lock(${testDatabaseLockId})`;
    await sql`drop schema if exists public cascade`;
    await sql`create schema public`;
    await sql`set search_path to public`;
    await runMigrationsWithSql(sql);

    return sql;
  } catch (error) {
    await sql`select pg_advisory_unlock(${testDatabaseLockId})`;
    await sql.end();
    throw error;
  }
}

export async function closeIsolatedTestSql(sql: postgres.Sql) {
  try {
    await sql`select pg_advisory_unlock(${testDatabaseLockId})`;
  } finally {
    await sql.end();
  }
}
