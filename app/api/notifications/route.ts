import { body, db, isoNow, json, requireUser, sameOrigin } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(){
  const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const d=db();
  const [rows,count]=await Promise.all([
    d.prepare("SELECT id,actor_id,actor_name,kind,title,message,link,created_at,read_at FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 80").bind(u.userId).all<any>(),
    d.prepare("SELECT COUNT(*) AS total FROM notifications WHERE recipient_id=? AND read_at IS NULL").bind(u.userId).first<any>()
  ]);
  return json({notifications:(rows.results||[]).map(n=>({id:n.id,actorId:n.actor_id,actorName:n.actor_name,kind:n.kind,title:n.title,message:n.message,link:n.link,createdAt:n.created_at,readAt:n.read_at})),unreadCount:Number(count?.total||0)});
}
export async function POST(request:Request){
  if(!(await sameOrigin(request)))return json({error:"bad_origin"},403);const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const b=await body(request);if(!b)return json({error:"invalid_body"},400);
  const d=db(),now=isoNow();if(b.action==="markAllRead"){await d.prepare("UPDATE notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL").bind(now,u.userId).run();return json({ok:true})}
  if(b.action==="markRead"){const id=String(b.notificationId||"");const r=await d.prepare("UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=? AND read_at IS NULL").bind(now,id,u.userId).run();return json({ok:true,changed:r.meta.changes})}
  return json({error:"unknown_action"},400);
}
