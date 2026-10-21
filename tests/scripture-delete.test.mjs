import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const html = readFileSync(new URL("../public/prayer-tree.html", import.meta.url), "utf8");
const helperStart = html.indexOf("async function deleteScriptureMeditation(id){");
const helperEnd = html.indexOf("async function editScriptureMeditation(id){", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "delete handler helpers must be present");
const helpers = html.slice(helperStart, helperEnd);
const detailSource = html.slice(html.indexOf('$("scriptureDetail").addEventListener("click",handleScriptureDetailClick)'), html.indexOf('$("scriptureDetail").addEventListener("click",handleScriptureDetailClick)') + 100);
assert.equal((html.match(/data-delete-meditation[^\n]*\.onclick/g) ?? []).length, 0, "delete buttons must not have a second direct click handler");
assert.match(detailSource, /addEventListener\("click",handleScriptureDetailClick\)/);
assert.equal((html.match(/addEventListener\("click",handleScriptureDetailClick\)/g) ?? []).length, 1);
assert.match(html, /data-edit-meditation/);
assert.match(html, /syncCurrentScriptureChapter/);
const makeHandlers = new Function("confirm", "fetch", "loadScriptureScope", "notify", `${helpers}; return { deleteScriptureMeditation, handleScriptureDetailClick };`);

function setupHandler({ confirmation = true, response = { ok: true }, networkError = null } = {}) {
  const calls = { confirms: 0, fetch: [], reloads: 0, notices: [] };
  const handlers = makeHandlers(
    () => { calls.confirms++; return confirmation; },
    async (...args) => { calls.fetch.push(args); if (networkError) throw networkError; return response; },
    async () => { calls.reloads++; },
    (message) => calls.notices.push(message),
  );
  const button = { dataset: { deleteMeditation: "note-1" } };
  const event = { target: { closest: (selector) => selector === "[data-delete-meditation]" ? button : null } };
  return { calls, handlers, event };
}

test("one bubbled click prompts once and deletes once after approval", async () => {
  for (const scope of ["private", "group", "shared"]) {
    const { calls, handlers, event } = setupHandler();
    await handlers.handleScriptureDetailClick(event);
    assert.equal(calls.confirms, 1, `${scope}: one confirmation`);
    assert.equal(calls.fetch.length, 1, `${scope}: one request`);
    assert.equal(calls.fetch[0][0], "/api/scripture-notes");
    assert.equal(calls.fetch[0][1].method, "DELETE");
    assert.deepEqual(JSON.parse(calls.fetch[0][1].body), { id: "note-1" });
    assert.equal(calls.reloads, 1, `${scope}: refreshed after success`);
    assert.equal(calls.notices.length, 0);
  }
});

test("cancel leaves the meditation and sends no request", async () => {
  const { calls, handlers, event } = setupHandler({ confirmation: false });
  await handlers.handleScriptureDetailClick(event);
  assert.equal(calls.confirms, 1);
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.reloads, 0);
});

test("server errors notify the user and keep the list loaded", async () => {
  const { calls, handlers, event } = setupHandler({ response: { ok: false, status: 500 } });
  await handlers.handleScriptureDetailClick(event);
  assert.equal(calls.confirms, 1);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.reloads, 0);
  assert.equal(calls.notices.length, 1);
});

test("network errors notify the user and keep the list loaded", async () => {
  const { calls, handlers, event } = setupHandler({ networkError: new Error("offline") });
  await handlers.handleScriptureDetailClick(event);
  assert.equal(calls.confirms, 1);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.reloads, 0);
  assert.equal(calls.notices.length, 1);
});

const routePath = new URL("../app/api/scripture-notes/route.ts", import.meta.url);
const routeSource = readFileSync(routePath, "utf8");
const temp = mkdtempSync(join(tmpdir(), "scripture-delete-"));
mkdirSync(join(temp, "app/api/scripture-notes"), { recursive: true });
writeFileSync(join(temp, "server.ts"), `export const db=()=>globalThis.__deleteDb; export const isoNow=()=>"2026-10-20T00:00:00.000Z"; export const json=(data,status=200)=>Response.json(data,{status}); export const requireUser=async()=>globalThis.__deleteUser; export const body=async(request)=>request.json(); export const sameOrigin=async()=>true;`);
const rewritten = routeSource
  .replace('import { db, json, requireUser, body, sameOrigin, isoNow } from "@/lib/server";', 'import { db, json, requireUser, body, sameOrigin, isoNow } from "../../../server.ts";')
;
writeFileSync(join(temp, "app/api/scripture-notes/route.ts"), rewritten);
const { DELETE } = await import(pathToFileURL(join(temp, "app/api/scripture-notes/route.ts")).href);

function databaseAdapter(sqlite) {
  return { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      first() { return sqlite.prepare(sql).get(...args) ?? null; },
      run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
}
async function deleteRequest(id) {
  return DELETE(new Request("https://prayer-tree.test/api/scripture-notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }));
}

test("DELETE removes only the requesting user's meditation copies and preserves other notes", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE scripture_meditations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sync_key TEXT); CREATE TABLE scripture_chapter_sync_groups (id TEXT PRIMARY KEY); CREATE TABLE scripture_chapter_sync_members (sync_group_id TEXT, chapter_id TEXT)");
  sqlite.prepare("INSERT INTO scripture_chapter_sync_groups VALUES(?)").run("group-record");
  sqlite.prepare("INSERT INTO scripture_chapter_sync_members VALUES(?,?)").run("group-record", "chapter-record");
  sqlite.prepare("INSERT INTO scripture_meditations VALUES(?,?,?)").run("owner-note", "owner", "owned-sync");
  sqlite.prepare("INSERT INTO scripture_meditations VALUES(?,?,?)").run("owner-copy", "owner", "owned-sync");
  sqlite.prepare("INSERT INTO scripture_meditations VALUES(?,?,?)").run("other-copy", "other-user", "owned-sync");
  sqlite.prepare("INSERT INTO scripture_meditations VALUES(?,?,?)").run("unrelated", "owner", "other-sync");
  Object.assign(globalThis, { __deleteDb: databaseAdapter(sqlite), __deleteUser: { userId: "owner", displayName: "Owner" } });
  const response = await deleteRequest("owner-note");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(sqlite.prepare("SELECT id FROM scripture_meditations ORDER BY id").all().map((row) => row.id), ["other-copy", "unrelated"]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM scripture_chapter_sync_groups").get().n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM scripture_chapter_sync_members").get().n, 1);
});

test("DELETE cannot remove a meditation owned by another user", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE scripture_meditations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sync_key TEXT)");
  sqlite.prepare("INSERT INTO scripture_meditations VALUES(?,?,?)").run("other-note", "other-user", "other-sync");
  Object.assign(globalThis, { __deleteDb: databaseAdapter(sqlite), __deleteUser: { userId: "owner", displayName: "Owner" } });
  const response = await deleteRequest("other-note");
  assert.equal(response.status, 404);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM scripture_meditations").get().n, 1);
});

for (const scope of ["private", "friends", "group"]) {
  for (const syncKey of [null, "scope-sync"]) {
    test(`DELETE in ${scope} books requires the meditation author (${syncKey ? "synced" : "unsynced"})`, async () => {
      const sqlite = new DatabaseSync(":memory:");
      try {
        sqlite.exec(`
          CREATE TABLE scripture_chapters (id TEXT PRIMARY KEY, scope_type TEXT, scope_id TEXT, created_by TEXT);
          CREATE TABLE scripture_meditations (id TEXT PRIMARY KEY, chapter_id TEXT, user_id TEXT NOT NULL, sync_key TEXT);
          CREATE TABLE friends (user_id TEXT, friend_id TEXT);
          CREATE TABLE group_members (group_id TEXT, user_id TEXT);
          CREATE TABLE scripture_chapter_access (chapter_id TEXT, user_id TEXT);
        `);
        sqlite.prepare("INSERT INTO scripture_chapters VALUES(?,?,?,?)").run("chapter", scope, scope === "group" ? "group-a" : "book-owner", "book-owner");
        sqlite.prepare("INSERT INTO friends VALUES(?,?)").run("book-owner", "author");
        sqlite.prepare("INSERT INTO friends VALUES(?,?)").run("book-owner", "peer");
        for (const user of ["book-owner", "author", "peer"]) {
          sqlite.prepare("INSERT INTO group_members VALUES(?,?)").run("group-a", user);
          sqlite.prepare("INSERT INTO scripture_chapter_access VALUES(?,?)").run("chapter", user);
        }
        // A private book's author is its owner; shared books may contain a peer's meditation.
        const author = scope === "private" ? "book-owner" : "author";
        const insert = sqlite.prepare("INSERT INTO scripture_meditations VALUES(?,?,?,?)");
        insert.run("target", "chapter", author, syncKey);
        insert.run("other-note", "chapter", "peer", syncKey);
        insert.run("unrelated", "chapter", author, "unrelated-sync");
        const before = sqlite.prepare("SELECT * FROM scripture_meditations ORDER BY id").all();
        for (const actor of (scope === "private" ? ["peer", "outsider"] : ["book-owner", "peer", "outsider"])) {
          Object.assign(globalThis, { __deleteDb: databaseAdapter(sqlite), __deleteUser: { userId: actor } });
          const denied = await deleteRequest("target");
          assert.equal(denied.status, 404, `${actor} cannot delete someone else's meditation`);
          assert.deepEqual(sqlite.prepare("SELECT * FROM scripture_meditations ORDER BY id").all(), before);
        }
        Object.assign(globalThis, { __deleteDb: databaseAdapter(sqlite), __deleteUser: { userId: author } });
        assert.equal((await deleteRequest("target")).status, 200);
        assert.deepEqual(sqlite.prepare("SELECT id FROM scripture_meditations ORDER BY id").all().map(row => row.id), ["other-note", "unrelated"]);
        assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM scripture_chapters").get().n, 1);
        assert.equal((await deleteRequest("target")).status, 404);
      } finally {
        sqlite.close();
      }
    });
  }
}
