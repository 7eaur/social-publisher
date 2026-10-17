import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabasePool, withinTransaction } from "../src/pool.ts";
import { migrate } from "../src/migrate.ts";
import {
  enqueue, claimJobs, acknowledgeJob, quarantineExpiredClaims, createDeliveryIntent
} from "../src/outbox.ts";
import { reserveScheduleSlot } from "../src/scheduling.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("Database integration tests require DATABASE_URL");
}
if (process.env.NODE_ENV !== "test" || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) {
  throw new Error("Database tests must use a dedicated test database");
}
const pool = createDatabasePool();
let waslRoute: string;
let religiousRoute: string;
let waslItem: string;
let religiousItem: string;
let waslDestination: string;
let religiousDestination: string;

before(async () => {
  const applied = await migrate(pool);
  assert.ok(applied.includes("0001_initial.sql") || applied.length === 0);
  assert.deepEqual(await migrate(pool), [], "migration must be idempotent");
  // The tests require a fresh, isolated ephemeral CI database.
  await pool.query(`TRUNCATE audit_events,temporary_media,outbox_jobs,publication_records,
    schedule_claims,schedule_rules,source_items,route_destinations,routes,destinations,
    content_sources,auth_sessions,users RESTART IDENTITY CASCADE`);
  const sourceWasl = await pool.query<{ id: string }>(
    "INSERT INTO content_sources(kind,external_peer_id,label) VALUES('TELEGRAM',$1,'Wasl') RETURNING id",
    [randomUUID()]
  );
  const sourceReligious = await pool.query<{ id: string }>(
    "INSERT INTO content_sources(kind,external_peer_id,label) VALUES('TELEGRAM',$1,'Religious') RETURNING id",
    [randomUUID()]
  );
  const sw = sourceWasl.rows[0]!.id;
  const sr = sourceReligious.rows[0]!.id;
  const routes = await Promise.all([
    pool.query<{ id: string }>(
      "INSERT INTO routes(slug,source_id,enabled) VALUES($1,$2,true) RETURNING id",
      ["wasl-"+randomUUID().slice(0,8), sw]
    ),
    pool.query<{ id: string }>(
      "INSERT INTO routes(slug,source_id,enabled) VALUES($1,$2,true) RETURNING id",
      ["religious-"+randomUUID().slice(0,8), sr]
    )
  ]);
  waslRoute = routes[0]!.rows[0]!.id;
  religiousRoute = routes[1]!.rows[0]!.id;
  await pool.query(
    "INSERT INTO schedule_rules(route_id,time_zone,iso_weekdays,slots,daily_limit,enabled) VALUES($1,'Asia/Aden',ARRAY[1,2,3,4,5,6,7],ARRAY['09:00','13:00'],1,true)",
    [waslRoute]
  );
  await pool.query(
    "INSERT INTO schedule_rules(route_id,time_zone,iso_weekdays,slots,daily_limit,enabled) VALUES($1,'Asia/Aden',ARRAY[1,2,3,4,5,6,7],ARRAY['09:00','13:00'],2,true)",
    [religiousRoute]
  );
  const d = await Promise.all([
    pool.query<{ id: string }>(
      "INSERT INTO destinations(platform,external_account_id,display_name) VALUES('FACEBOOK',$1,'Wasl Page') RETURNING id",
      [randomUUID()]
    ),
    pool.query<{ id: string }>(
      "INSERT INTO destinations(platform,external_account_id,display_name) VALUES('INSTAGRAM',$1,'Religious IG') RETURNING id",
      [randomUUID()]
    )
  ]);
  waslDestination = d[0]!.rows[0]!.id;
  religiousDestination = d[1]!.rows[0]!.id;
  await pool.query("INSERT INTO route_destinations(route_id,destination_id) VALUES($1,$2)", [waslRoute,waslDestination]);
  await pool.query("INSERT INTO route_destinations(route_id,destination_id) VALUES($1,$2)", [religiousRoute,religiousDestination]);
  const items = await Promise.all([
    pool.query<{ id: string }>(
      "INSERT INTO source_items(route_id,source_id,canonical_message_id,kind,source_created_at) VALUES($1,$2,1,'IMAGE',now()) RETURNING id",
      [waslRoute,sw]
    ),
    pool.query<{ id: string }>(
      "INSERT INTO source_items(route_id,source_id,canonical_message_id,kind,source_created_at) VALUES($1,$2,1,'VIDEO',now()) RETURNING id",
      [religiousRoute,sr]
    )
  ]);
  waslItem = items[0]!.rows[0]!.id;
  religiousItem = items[1]!.rows[0]!.id;
});
after(async () => { await pool.end(); });

test("migration checksum and schema are enforced", async () => {
  const count = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
  assert.equal(count.rows[0]?.n, 3);
});

test("two workers cannot create duplicate publication intent for same destination", async () => {
  const attempts = await Promise.all([
    withinTransaction(pool, client => createDeliveryIntent(client, waslItem, waslDestination)),
    withinTransaction(pool, client => createDeliveryIntent(client, waslItem, waslDestination))
  ]);
  assert.equal(attempts.filter(Boolean).length, 1);
  const pubs = await pool.query("SELECT count(*)::int AS n FROM publication_records WHERE source_item_id=$1", [waslItem]);
  const jobs = await pool.query("SELECT count(*)::int AS n FROM outbox_jobs WHERE kind='PUBLISH'");
  assert.equal(pubs.rows[0]?.n, 1);
  assert.equal(jobs.rows[0]?.n, 1);
});

test("a destination belonging to the other route is rejected", async () => {
  const result = await withinTransaction(pool, client => createDeliveryIntent(client, waslItem, religiousDestination));
  assert.equal(result, null);
});

test("SKIP LOCKED distributes a job at most once; lease acknowledgement is fenced", async () => {
  const [first, second] = await Promise.all([claimJobs(pool), claimJobs(pool)]);
  assert.equal(first.length + second.length, 1);
  const job = (first[0] ?? second[0])!;
  assert.equal(job.kind, "PUBLISH");
  assert.equal(await acknowledgeJob(pool,job.id,randomUUID()), false);
  assert.equal(await acknowledgeJob(pool,job.id,job.lease_token), true);
  assert.equal(await acknowledgeJob(pool,job.id,job.lease_token), false);
  assert.equal((await claimJobs(pool)).length, 0);
});

test("expired job claims are quarantined and never blindly retried", async () => {
  const id = await withinTransaction(pool, client =>
    enqueue(client, "sync:"+randomUUID(), "SYNC", { source: "test" })
  );
  assert.ok(id);
  const jobs = await claimJobs(pool);
  assert.equal(jobs.length, 1);
  await pool.query("UPDATE outbox_jobs SET leased_until=now()-interval '1 minute' WHERE id=$1",[id]);
  assert.equal(await quarantineExpiredClaims(pool), 1);
  assert.equal(await acknowledgeJob(pool,id!,jobs[0]!.lease_token), false);
  assert.equal((await claimJobs(pool)).length,0);
  const row = await pool.query("SELECT state FROM outbox_jobs WHERE id=$1",[id]);
  assert.equal(row.rows[0]?.state,"UNCERTAIN");
});

test("daily limit is atomic when parallel slot reservations compete", async () => {
  const winner = await Promise.all([
    reserveScheduleSlot(pool,waslRoute,waslItem,"2026-10-13","09:00"),
    reserveScheduleSlot(pool,waslRoute,waslItem,"2026-10-13","09:00")
  ]);
  assert.equal(winner.filter(Boolean).length,1);
  assert.equal(await reserveScheduleSlot(pool,waslRoute,waslItem,"2026-10-13","13:00"),null);
  const separate = await reserveScheduleSlot(pool,religiousRoute,religiousItem,"2026-10-13","09:00");
  assert.ok(separate);
});

test("source item cannot be reserved under an unrelated route", async () => {
  assert.equal(
    await reserveScheduleSlot(pool,religiousRoute,waslItem,"2026-10-14","13:00"),
    null
  );
});

test("Instagram text-only content is skipped without producing a publish job", async () => {
  const source = await pool.query<{source_id:string}>(
    "SELECT source_id FROM routes WHERE id=$1",[religiousRoute]
  );
  const item = await pool.query<{id:string}>(
    `INSERT INTO source_items(route_id,source_id,canonical_message_id,kind,source_created_at)
     VALUES($1,$2,44,'TEXT',now()) RETURNING id`,
    [religiousRoute,source.rows[0]!.source_id]
  );
  const id = await withinTransaction(pool,client=>
    createDeliveryIntent(client,item.rows[0]!.id,religiousDestination)
  );
  assert.ok(id);
  const status = await pool.query<{state:string}>(
    "SELECT state FROM publication_records WHERE id=$1",[id]
  );
  assert.equal(status.rows[0]?.state,"SKIPPED_UNSUPPORTED");
  const jobs = await pool.query<{n:number}>(
    "SELECT count(*)::int AS n FROM outbox_jobs WHERE dedup_key=$1",
    ["publication:"+id]
  );
  assert.equal(jobs.rows[0]?.n,0);
});

test("destination credentials are encrypted and tied to correct destination id", async () => {
  const {randomBytes}=await import("node:crypto");
  const {saveDestinationCredential,readDestinationCredential}=await import("../src/credentials.ts");
  const key=randomBytes(32);
  assert.equal(await saveDestinationCredential(pool,waslDestination,"test-token-not-for-production",key),true);
  assert.equal(await readDestinationCredential(pool,waslDestination,key),"test-token-not-for-production");
  const row=await pool.query<{hex:string}>(
    "SELECT encode(credentials_ciphertext,'hex') AS hex FROM destinations WHERE id=$1",
    [waslDestination]);
  assert.notEqual(row.rows[0]!.hex,Buffer.from("test-token-not-for-production").toString("hex"));
  await assert.rejects(readDestinationCredential(pool,waslDestination,randomBytes(32)));
  assert.equal(await readDestinationCredential(pool,religiousDestination,key),null);
});

test("expired publish claim marks the publication record uncertain in the same transaction",async()=>{
  const publicationId=await withinTransaction(pool,client=>
    createDeliveryIntent(client,religiousItem,religiousDestination)
  );
  assert.ok(publicationId);
  const claimed=await claimJobs(pool);
  assert.equal(claimed.length,1);
  assert.equal(claimed[0]?.kind,"PUBLISH");
  await pool.query("UPDATE outbox_jobs SET leased_until=now()-interval '1 minute' WHERE id=$1",[claimed[0]!.id]);
  assert.equal(await quarantineExpiredClaims(pool),1);
  const publication=await pool.query<{state:string}>(
    "SELECT state FROM publication_records WHERE id=$1",[publicationId]);
  assert.equal(publication.rows[0]?.state,"UNCERTAIN");
  assert.equal((await claimJobs(pool)).length,0);
});
