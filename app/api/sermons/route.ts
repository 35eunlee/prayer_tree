import { body, db, isoNow, json, requireUser, sameOrigin } from "@/lib/server";
export const dynamic="force-dynamic";
async function displayName(d:ReturnType<typeof db>,userId:string){const row=await d.prepare("SELECT state_json FROM user_states WHERE user_id=?").bind(userId).first<any>();try{const s=JSON.parse(row?.state_json||"{}");return String(s.trees?.[0]?.name||"기도나무 사용자").slice(0,40)}catch{return "기도나무 사용자"}}
export async function GET(){
  const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const d=db();
  const rows=await d.prepare(`SELECT s.* FROM sermons s WHERE s.author_id=?
    OR (s.visibility IN ('friends','friends_groups') AND EXISTS(SELECT 1 FROM friends f WHERE f.user_id=? AND f.friend_id=s.author_id) AND ((s.visibility='friends' AND NOT EXISTS(SELECT 1 FROM json_each(s.friend_ids_json))) OR EXISTS(SELECT 1 FROM json_each(s.friend_ids_json) fids WHERE fids.value=?)))
    OR (s.visibility IN ('groups','friends_groups') AND EXISTS(SELECT 1 FROM json_each(s.group_ids_json) j JOIN group_members gm ON gm.group_id=j.value WHERE gm.user_id=?))
    OR (s.visibility='public' AND (EXISTS(SELECT 1 FROM friends f WHERE f.user_id=? AND f.friend_id=s.author_id) OR EXISTS(SELECT 1 FROM group_members mine JOIN group_members theirs ON theirs.group_id=mine.group_id WHERE mine.user_id=? AND theirs.user_id=s.author_id)))
    ORDER BY s.updated_at DESC`).bind(u.userId,u.userId,u.userId,u.userId,u.userId,u.userId).all<any>();
  return json({sermons:(rows.results||[]).map(x=>({id:x.id,authorId:x.author_id,authorName:x.author_id===u.userId?"나":x.author_name,title:x.title,scripture:x.scripture,content:x.content,folder:x.folder,recordType:x.record_type||"sermon",visibility:x.visibility,groupIds:JSON.parse(x.group_ids_json||"[]"),friendIds:JSON.parse(x.friend_ids_json||"[]"),createdAt:x.created_at,updatedAt:x.updated_at,canEdit:x.author_id===u.userId}))});
}
export async function POST(request:Request){
  if(!(await sameOrigin(request)))return json({error:"bad_origin"},403);const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const b=await body(request);if(!b)return json({error:"invalid_body"},400);const d=db(),now=isoNow(),action=String(b.action||"");
  if(action==="recordTypeRename"){const from=String(b.from||"").trim().slice(0,40),to=String(b.to||"").trim().slice(0,40);if(!from||!to||from===to)return json({error:"invalid_record_type"},400);const exists=await d.prepare("SELECT 1 FROM sermons WHERE author_id=? AND record_type=? LIMIT 1").bind(u.userId,from).first<any>();if(exists)await d.prepare("UPDATE sermons SET record_type=?,updated_at=? WHERE author_id=? AND record_type=?").bind(to,now,u.userId,from).run();return json({ok:true})}
  if(action==="recordTypeDelete"){const type=String(b.recordType||"").trim().slice(0,40);if(!type)return json({error:"invalid_record_type"},400);const fallback=type==="설교"?"말씀 묵상":"설교";await d.prepare("UPDATE sermons SET record_type=?,updated_at=? WHERE author_id=? AND record_type=?").bind(fallback,now,u.userId,type).run();return json({ok:true,fallback,keptRecords:true})}
  if(action==="folderRename"){const from=String(b.from||"").trim().slice(0,40),to=String(b.to||"").trim().slice(0,40);if(!from||!to||from===to)return json({error:"invalid_folder"},400);await d.prepare("UPDATE sermons SET folder=?,updated_at=? WHERE author_id=? AND folder=?").bind(to,now,u.userId,from).run();return json({ok:true})}
  if(action==="folderDelete"){const folder=String(b.folder||"").trim().slice(0,40);const moveTo=String(b.moveTo||"").trim().slice(0,40);if(!folder||!moveTo||folder===moveTo)return json({error:"invalid_folder"},400);await d.prepare("UPDATE sermons SET folder=?,updated_at=? WHERE author_id=? AND folder=?").bind(moveTo,now,u.userId,folder).run();return json({ok:true,moveTo,keptRecords:true})}
  if(action==="delete"){const r=await d.prepare("DELETE FROM sermons WHERE id=? AND author_id=?").bind(String(b.id||""),u.userId).run();return r.meta.changes?json({ok:true}):json({error:"not_found"},404)}
  if(action!=="save")return json({error:"unknown_action"},400);
  const id=String(b.id||crypto.randomUUID()),title=String(b.title||"").trim(),scripture=String(b.scripture||"").trim(),content=String(b.content||"").trim(),folder=String(b.folder||"기본 폴더").trim().slice(0,40)||"기본 폴더",recordType=String(b.recordType||"설교").trim().slice(0,40)||"설교";
  let visibility=["private","friends","groups","friends_groups"].includes(String(b.visibility))?String(b.visibility):"private";
  const groupIds=Array.isArray(b.groupIds)?[...new Set(b.groupIds.map(String))].slice(0,30):[],requestedFriendIds=Array.isArray(b.friendIds)?[...new Set(b.friendIds.map(String))].slice(0,100):[];
  if(!title||!scripture||!content||title.length>100||scripture.length>160||content.length>5000)return json({error:"invalid_fields"},400);
  const groupRows=groupIds.length?await d.prepare(`SELECT group_id FROM group_members WHERE user_id=? AND group_id IN (${groupIds.map(()=>"?").join(",")})`).bind(u.userId,...groupIds).all<any>():{results:[]};const validGroupIds=(groupRows.results||[]).map((x:any)=>x.group_id);
  if(validGroupIds.length!==groupIds.length)return json({error:"group_forbidden"},403);
  const friendRows=requestedFriendIds.length?await d.prepare(`SELECT friend_id FROM friends WHERE user_id=? AND friend_id IN (${requestedFriendIds.map(()=>"?").join(",")})`).bind(u.userId,...requestedFriendIds).all<any>():{results:[]};const friendIds=(friendRows.results||[]).map((x:any)=>x.friend_id);
  if(friendIds.length!==requestedFriendIds.length)return json({error:"friend_forbidden"},403);
  if(visibility==="public")visibility=groupIds.length&&friendIds.length?"friends_groups":groupIds.length?"groups":friendIds.length?"friends":"private";
  if(visibility==="groups"&&!groupIds.length)return json({error:"groups_required"},400);
  if(visibility==="friends"&&!friendIds.length)return json({error:"friends_required"},400);
  if(visibility==="friends_groups"&&(!groupIds.length||!friendIds.length))return json({error:"sharing_targets_required"},400);
  const name=await displayName(d,u.userId),existing=await d.prepare("SELECT author_id FROM sermons WHERE id=?").bind(id).first<any>();if(existing&&existing.author_id!==u.userId)return json({error:"forbidden"},403);
  if(existing)await d.prepare("UPDATE sermons SET title=?,scripture=?,content=?,folder=?,record_type=?,visibility=?,group_ids_json=?,friend_ids_json=?,updated_at=? WHERE id=? AND author_id=?").bind(title,scripture,content,folder,recordType,visibility,JSON.stringify(groupIds),JSON.stringify(friendIds),now,id,u.userId).run();
  else await d.prepare("INSERT INTO sermons(id,author_id,author_name,title,scripture,content,folder,record_type,visibility,group_ids_json,friend_ids_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,u.userId,name,title,scripture,content,folder,recordType,visibility,JSON.stringify(groupIds),JSON.stringify(friendIds),now,now).run();
  return json({ok:true,id});
}
