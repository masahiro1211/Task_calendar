import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
const globalForPostgres = globalThis as unknown as {
  taskCalendarSql?: postgres.Sql;
};

export function hasDatabaseUrl() {
  return Boolean(connectionString);
}

export function getSql() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for app database access.");
  }

  globalForPostgres.taskCalendarSql ??= postgres(connectionString, {
    prepare: false
  });

  return globalForPostgres.taskCalendarSql;
}
