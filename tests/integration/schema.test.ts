import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeIsolatedTestSql,
  createIsolatedTestSql,
  testDatabaseUrl
} from "./helpers/db";

const maybeDescribe = testDatabaseUrl ? describe : describe.skip;

maybeDescribe("schema migration", () => {
  let sql: Awaited<ReturnType<typeof createIsolatedTestSql>>;

  beforeEach(async () => {
    sql = await createIsolatedTestSql();
  });

  afterEach(async () => {
    await closeIsolatedTestSql(sql);
  });

  it("applies schema and creates core tables and views", async () => {
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
  });
});
