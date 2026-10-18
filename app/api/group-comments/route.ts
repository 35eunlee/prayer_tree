import { body, db, isoNow, json, requireUser, sameOrigin } from "@/lib/server";
import { notifyUser } from "@/lib/notifications";
export const dynamic="force-dynamic";
async function visiblePrayer(groupId:string,prayerId:string){return await db().prepare("SELECT owner_id FROM shared_prayers p WHERE p.id=? AND p.visibility IN ('groups','friends_groups') AND EXISTS(SELECT 1 FROM json_each(p.group_ids_json) j WHERE j.value=?)").bind(prayerId,groupId).first<any>()}
export async function GET(request:Request){
  const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const url=new URL(request.url),groupId=url.searchParams.get("groupId")||"",prayerId=url.searchParams.get("prayerId")||"",d=db();
  if(!groupId||!prayerId)return json({error:"missing_target"},400);const prayer=await visiblePrayer(groupId,prayerId);if(!prayer)return json({error:"prayer_not_visible"},404);
  const member=await d.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").bind(groupId,u.userId).first();if(!member&&prayer.owner_id!==u.userId)return json({error:"forbidden"},403);
  const group=await d.prepare("SELECT creator_id FROM prayer_groups WHERE id=?").bind(groupId).first<any>();const rows=await d.prepare("SELECT id,author_id,author_name,body,visibility,created_at,updated_at FROM group_comments WHERE group_id=? AND prayer_id=? ORDER BY created_at").bind(groupId,prayerId).all<any>();
  return json({comments:(rows.results||[]).filter(c=>c.visibility!=="private"||prayer.owner_id===u.userId).map(c=>({id:c.id,authorName:c.author_name,body:c.body,visibility:c.visibility,createdAt:c.created_at,updatedAt:c.updated_at,canEdit:c.author_id===u.userId,canDelete:c.author_id===u.userId||group?.creator_id===u.userId}))});
}
export async function POST(request:Request){
  if(!(await sameOrigin(request)))return json({error:"bad_origin"},403);const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const b=await body(request);if(!b)return json({error:"invalid_body"},400);
  const d=db(),groupId=String(b.groupId||""),prayerId=String(b.prayerId||""),action=String(b.action||"");if(!groupId||!prayerId)return json({error:"missing_target"},400);
  if(!(await d.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").bind(groupId,u.userId).first()))return json({error:"forbidden"},403);const prayer=await visiblePrayer(groupId,prayerId);if(!prayer)return json({error:"prayer_not_visible"},404);
  const now=isoNow();
  if(action==="create"){const text=String(b.body||"").trim();if(!text||text.length>600)return json({error:"comment_length"},400);const visibility=b.visibility==="private"?"private":"public";await d.prepare("INSERT INTO group_comments(id,group_id,prayer_id,author_id,author_name,body,visibility,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),groupId,prayerId,u.userId,String(u.fullName||u.email).slice(0,80),text,visibility,now,now).run();if(prayer.owner_id!==u.userId)await notifyUser({recipientId:prayer.owner_id,actorId:u.userId,actorName:String(u.fullName||u.email||"친구"),kind:"comment",title:"기도제목에 댓글이 달렸어요",message:"친구가 함께 나눈 기도제목에 댓글을 남겼어요.",link:`comment:${groupId}:${prayerId}`});return json({ok:true,visibility})}
  const id=String(b.commentId||""),comment=await d.prepare("SELECT author_id FROM group_comments WHERE id=? AND group_id=? AND prayer_id=?").bind(id,groupId,prayerId).first<any>();if(!comment)return json({error:"comment_not_found"},404);
  if(action==="edit"){if(comment.author_id!==u.userId)return json({error:"forbidden"},403);const text=String(b.body||"").trim();if(!text||text.length>600)return json({error:"comment_length"},400);await d.prepare("UPDATE group_comments SET body=?,updated_at=? WHERE id=?").bind(text,now,id).run();return json({ok:true})}
  if(action==="delete"){const group=await d.prepare("SELECT creator_id FROM prayer_groups WHERE id=?").bind(groupId).first<any>();if(comment.author_id!==u.userId&&group?.creator_id!==u.userId)return json({error:"forbidden"},403);await d.prepare("DELETE FROM group_comments WHERE id=?").bind(id).run();return json({ok:true})}
  return json({error:"unknown_action"},400);
}
