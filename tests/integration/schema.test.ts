import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/migrations";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function assertLocalTestDatabase(connectionString: string) {
  const url = new URL(connectionString);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!localHosts.has(url.hostname)) {
    throw new Error("TEST_DATABASE_URL must point to a local Postgres instance.");
  }
}

const maybeDescribe = testDatabaseUrl ? describe : describe.skip;

maybeDescribe("schema migration", () => {
  it("applies schema and creates core tables and views", async () => {
    assertLocalTestDatabase(testDatabaseUrl!);
    await runMigrations(testDatabaseUrl!);

    const sql = postgres(testDatabaseUrl!, {
      max: 1,
      prepare: false
    });

    try {
      const objects = await sql<{ relname: string }[]>`
        select relname
        from pg_class
        where relname in (
          'tasks',
          'blocks',
          'gcal_calendars',
          'gcal_events_cache',
          'google_auth',
          'v_tasks_resolved',
          'v_leaves',
          'v_pool',
          'v_needs_split',
          'v_progress'
        )
      `;

      expect(new Set(objects.map((object) => object.relname))).toEqual(
        new Set([
          "tasks",
          "blocks",
          "gcal_calendars",
          "gcal_events_cache",
          "google_auth",
          "v_tasks_resolved",
          "v_leaves",
          "v_pool",
          "v_needs_split",
          "v_progress"
        ])
      );
    } finally {
      await sql.end();
    }
  });
});
