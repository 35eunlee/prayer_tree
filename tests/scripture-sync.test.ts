import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const routePath = new URL("../app/api/scripture-notes/route.ts", import.meta.url);
const source = readFileSync(routePath, "utf8");
assert.equal((source.match(/async function syncScriptureChapter\(/g) ?? []).length, 1, "the route must define one syncScriptureChapter implementation");
const temp = mkdtempSync(join(tmpdir(), "scripture-sync-"));
mkdirSync(join(temp, "app/api/scripture-notes"), { recursive: true });
writeFileSync(join(temp, "server.ts"), `export const db=()=>globalThis.__prayerDb; export const isoNow=()=>"2026-10-20T00:00:00.000Z"; export const json=()=>{}; export const requireUser=()=>{}; export const body=()=>{}; export const sameOrigin=()=>{};`);
const rewritten = source
  .replace('import { db, json, requireUser, body, sameOrigin, isoNow } from "@/lib/server";', 'import { db, json, requireUser, body, sameOrigin, isoNow } from "../../../server.ts";')
  + "\nexport { syncScriptureChapter, syncMeditationCopies };\n";
writeFileSync(join(temp, "app/api/scripture-notes/route.ts"), rewritten);
const { syncScriptureChapter, syncMeditationCopies } = await import(pathToFileURL(join(temp, "app/api/scripture-notes/route.ts")).href);

function count(sqlite: DatabaseSync, sql: string, ...args: Array<string | number | bigint | Uint8Array | null>): number {
  return Number(sqlite.prepare(sql).get(...args)?.n ?? 0);
}

function setup(scopeType = "private", scopeId = "owner") {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE scripture_chapters (id TEXT PRIMARY KEY, scope_type TEXT, scope_id TEXT, book_id TEXT, book_name TEXT, chapter INTEGER, scripture_text TEXT, created_by TEXT, creator_name TEXT, is_anonymous INTEGER, created_at TEXT, updated_at TEXT, UNIQUE(scope_type,scope_id,book_id,chapter));
    CREATE TABLE scripture_meditations (id TEXT PRIMARY KEY, chapter_id TEXT, user_id TEXT, author_name TEXT, body TEXT, is_seed INTEGER, is_anonymous INTEGER, visibility TEXT, sync_key TEXT, created_at TEXT);
    CREATE TABLE scripture_chapter_sync_groups (id TEXT PRIMARY KEY, owner_id TEXT, book_id TEXT, chapter INTEGER, created_at TEXT, UNIQUE(owner_id,book_id,chapter));
    CREATE TABLE scripture_chapter_sync_members (sync_group_id TEXT, chapter_id TEXT, PRIMARY KEY(sync_group_id,chapter_id));
    CREATE TABLE scripture_chapter_access (chapter_id TEXT, user_id TEXT, created_at TEXT, UNIQUE(chapter_id,user_id));
    CREATE TABLE friends (user_id TEXT, friend_id TEXT);
    CREATE TABLE group_members (group_id TEXT, user_id TEXT);
  `);
  const d = {
    prepare(sql: string) {
      let args: Array<string | number | bigint | Uint8Array | null> = [];
      return {
        bind(...values: Array<string | number | bigint | Uint8Array | null>) { args = values; return this; },
        first() { return sqlite.prepare(sql).get(...args) ?? null; },
        all() { return { results: sqlite.prepare(sql).all(...args) }; },
        run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
      };
    },
  };
  Object.assign(globalThis, { __prayerDb: d });
  const insertChapter = sqlite.prepare("INSERT INTO scripture_chapters VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  insertChapter.run("source", scopeType, scopeId, "gen", "창세기", 1, "본문 텍스트 원문", "owner", "소유자", 0, "t0", "t0");
  sqlite.prepare("INSERT INTO friends VALUES(?,?)").run("owner", "friend-a");
  sqlite.prepare("INSERT INTO friends VALUES(?,?)").run("owner", "friend-b");
  sqlite.prepare("INSERT INTO group_members VALUES(?,?)").run("group-a", "owner");
  sqlite.prepare("INSERT INTO group_members VALUES(?,?)").run("group-b", "owner");
  if (scopeType === "friends") sqlite.prepare("INSERT INTO scripture_chapter_access VALUES(?,?,?)").run("source", "friend-a", "t0");
  const note = sqlite.prepare("INSERT INTO scripture_meditations VALUES(?,?,?,?,?,?,?,?,?,?)");
  note.run("inherited", "source", "owner", "소유자", "공유 묵상", 0, 0, "inherit", null, "t1");
  note.run("private-note", "source", "owner", "소유자", "비공개 묵상", 0, 0, "private", null, "t2");
  note.run("collaborator-note", "source", "friend-a", "친구", "친구만의 묵상", 0, 0, "inherit", null, "t3");
  return { sqlite, d };
}

test("personal chapter syncs idempotently to friend and group books; private notes stay private", async () => {
  const { sqlite, d } = setup();
  assert.deepEqual(await syncScriptureChapter(d, "owner", "source", ["group-a"], ["friend-a"], false), { ok: true });
  const chapters = sqlite.prepare("SELECT id,scope_type,scope_id,scripture_text FROM scripture_chapters WHERE id<>'source' ORDER BY scope_type").all();
  assert.equal(chapters.length, 2);
  assert.deepEqual(chapters.map((x) => x.scripture_text), ["본문 텍스트 원문", "본문 텍스트 원문"]);
  const friendChapterRow = chapters.find((x) => x.scope_type === "friends");
  const groupChapterRow = chapters.find((x) => x.scope_type === "group");
  assert.ok(friendChapterRow);
  assert.ok(groupChapterRow);
  const friendChapter = String(friendChapterRow.id);
  const groupChapter = String(groupChapterRow.id);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE chapter_id IN (?,?) AND body='공유 묵상'", friendChapter, groupChapter), 2);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE chapter_id IN (?,?) AND body='비공개 묵상'", friendChapter, groupChapter), 0);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE chapter_id IN (?,?) AND user_id='friend-a'", friendChapter, groupChapter), 0);
  const countBefore = count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations");
  await syncScriptureChapter(d, "owner", "source", ["group-a"], ["friend-a"], false);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations"), countBefore);
  await syncScriptureChapter(d, "owner", "source", ["group-a"], ["friend-a", "friend-b"], false);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_chapters WHERE scope_type='friends'"), 1);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_chapter_access WHERE user_id IN ('friend-a','friend-b')"), 2);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE chapter_id=? AND body='공유 묵상'", friendChapter), 1);
});

test("group and friend-shared sources also sync to the other book scopes", async () => {
  const cases: Array<[string, string, string[], string[]]> = [
    ["group", "group-a", ["group-b"], ["friend-a"]],
    ["friends", "owner", ["group-a"], ["friend-b"]],
  ];
  for (const [scopeType, scopeId, groups, friends] of cases) {
    const { sqlite, d } = setup(scopeType, scopeId);
    await syncScriptureChapter(d, "owner", "source", groups, friends, true);
    const chapters = sqlite.prepare("SELECT id,scope_type,scope_id,scripture_text FROM scripture_chapters WHERE id<>'source'").all();
    const expectedCopies = scopeType === "friends" ? 2 : 3;
    assert.equal(chapters.length, expectedCopies);
    assert.deepEqual(chapters.map((chapter) => chapter.scripture_text), Array(expectedCopies).fill("본문 텍스트 원문"));
    const ids = chapters.map((chapter) => String(chapter.id));
    const placeholders = ids.map(() => "?").join(",");
    assert.equal(count(sqlite, `SELECT COUNT(*) AS n FROM scripture_meditations WHERE chapter_id IN (${placeholders}) AND body='공유 묵상'`, ...ids), expectedCopies);
    assert.equal(count(sqlite, `SELECT COUNT(*) AS n FROM scripture_meditations WHERE chapter_id IN (${placeholders}) AND body='비공개 묵상'`, ...ids), 0);
  }
});

test("editing, making an owned note private, and deleting it affect only its synchronized copies", async () => {
  const { sqlite, d } = setup();
  await syncScriptureChapter(d, "owner", "source", ["group-a"], ["friend-a"], false);
  const copied = sqlite.prepare("SELECT id,chapter_id AS chapterId FROM scripture_meditations WHERE sync_key='inherited'").all();
  const groupIds = sqlite.prepare("SELECT chapter_id AS chapterId FROM scripture_chapter_sync_members").all().map((r) => String(r.chapterId));
  await syncMeditationCopies(d, "owner", "source", "inherited", "inherit");
  sqlite.prepare("UPDATE scripture_meditations SET body='수정된 묵상' WHERE id='inherited'").run();
  await syncMeditationCopies(d, "owner", "source", "inherited", "inherit");
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE sync_key='inherited' AND body='수정된 묵상'"), groupIds.length);
  sqlite.prepare("UPDATE scripture_meditations SET visibility='private' WHERE id='inherited'").run();
  await syncMeditationCopies(d, "owner", "source", "inherited", "private");
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE sync_key='inherited'"), 1);
  sqlite.prepare("DELETE FROM scripture_meditations WHERE sync_key=? AND user_id=?").run("inherited", "owner");
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE sync_key='inherited'"), 0);
  assert.equal(count(sqlite, "SELECT COUNT(*) AS n FROM scripture_meditations WHERE id='collaborator-note'"), 1);
  assert.equal(copied.length, groupIds.length);
});
