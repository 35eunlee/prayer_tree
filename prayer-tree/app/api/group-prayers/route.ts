import { body, db, isoNow, json, requireUser, sameOrigin, todaySeoul } from "@/lib/server";
import { notifyUser } from "@/lib/notifications";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return json({ error: "sign_in_required" }, 401);
  const groupId = new URL(request.url).searchParams.get("groupId") || "", day=todaySeoul();
  const d = db();
  const member = await d.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").bind(groupId, user.userId).first();
  if (!groupId || !member) return json({ error: "forbidden" }, 403);
  const [group, rows] = await Promise.all([
    d.prepare("SELECT name FROM prayer_groups WHERE id=?").bind(groupId).first<any>(),
    d.prepare("SELECT i.id,i.body,i.created_by,i.created_at,(SELECT COUNT(*) FROM group_intercession_waters w WHERE w.group_id=i.group_id AND w.prayer_id=i.id) AS water_count,EXISTS(SELECT 1 FROM group_intercession_waters w WHERE w.group_id=i.group_id AND w.prayer_id=i.id AND w.user_id=? AND w.day=?) AS watered_today FROM group_intercessions i WHERE i.group_id=? ORDER BY i.created_at DESC LIMIT 100").bind(user.userId,day,groupId).all<any>()
  ]);
  return json({ groupName: group?.name || "그룹", prayers: (rows.results || []).map((row: any) => ({ id: row.id, body: row.body, authorName: group?.name || "그룹", createdAt: row.created_at, waterCount:Number(row.water_count||0),wateredToday:!!row.watered_today,canDelete: row.created_by === user.userId })), waterTotal:(rows.results||[]).reduce((n:number,row:any)=>n+Number(row.water_count||0),0) });
}

export async function POST(request: Request) {
  if (!(await sameOrigin(request))) return json({ error: "bad_origin" }, 403);
  const user = await requireUser();
  if (!user) return json({ error: "sign_in_required" }, 401);
  const payload = await body(request);
  const groupId = String(payload?.groupId || "");
  const d = db();
  const member = await d.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").bind(groupId, user.userId).first();
  if (!groupId || !member) return json({ error: "forbidden" }, 403);
  const action = String(payload?.action || "create");
  if(action==="pray"){
    const prayerId=String(payload?.id||"");
    const prayer=await d.prepare("SELECT id FROM group_intercessions WHERE id=? AND group_id=?").bind(prayerId,groupId).first();
    if(!prayer)return json({error:"prayer_not_found"},404);
    const day=todaySeoul(),now=isoNow(),displayName=String(payload?.displayName||user.fullName||user.email||"친구").slice(0,80);
    const result=await d.prepare("INSERT OR IGNORE INTO group_intercession_waters(group_id,prayer_id,user_id,display_name,day,created_at) VALUES(?,?,?,?,?,?)").bind(groupId,prayerId,user.userId,displayName,day,now).run();
    const count=await d.prepare("SELECT COUNT(*) AS n FROM group_intercession_waters WHERE group_id=? AND prayer_id=?").bind(groupId,prayerId).first<any>();
    return json({ok:true,already:!result.meta.changes,count:Number(count?.n||0)});
  }
  if (action === "delete") {
    const id = String(payload?.id || "");
    const result = await d.prepare("DELETE FROM group_intercessions WHERE id=? AND group_id=? AND created_by=?").bind(id, groupId, user.userId).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: "prayer_not_found" }, 404);
  }
  const text = String(payload?.body || "").trim();
  if (!text || text.length > 1000) return json({ error: "invalid_prayer" }, 400);
  const now = isoNow(), id = crypto.randomUUID();
  await d.prepare("INSERT INTO group_intercessions(id,group_id,body,created_by,created_at) VALUES(?,?,?,?,?)").bind(id, groupId, text, user.userId, now).run();
  const group = await d.prepare("SELECT name FROM prayer_groups WHERE id=?").bind(groupId).first<any>();
  const members = await d.prepare("SELECT user_id FROM group_members WHERE group_id=? AND user_id<>?").bind(groupId, user.userId).all<any>();
  for (const row of members.results || []) await notifyUser({ recipientId: row.user_id, actorId: user.userId, actorName: String(group?.name || "그룹"), kind: "group_prayer", title: "그룹 중보기도가 올라왔어요", message: `${group?.name || "그룹"}에 새로운 중보기도가 올라왔어요.`, link: "together" });
  return json({ ok: true, id, createdAt: now });
}
