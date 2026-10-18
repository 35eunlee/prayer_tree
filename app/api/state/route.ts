import { db, json, requireUser, body, sameOrigin, isoNow, isGroupMember, todaySeoul } from "@/lib/server";
export const dynamic="force-dynamic";

export async function GET() {
  const u=await requireUser(); if(!u)return json({error:"sign_in_required"},401);
  const d=db(); const row=await d.prepare("SELECT state_json FROM user_states WHERE user_id=?").bind(u.userId).first<{state_json:string}>();
  if(!row)return json({state:null,displayName:u.fullName||u.email,userId:u.userId});
  let state:any; try{state=JSON.parse(row.state_json)}catch{return json({error:"stored_state_invalid"},500)}
  const waterRows=await d.prepare("SELECT prayer_id,user_id,display_name,day,created_at FROM waters WHERE owner_id=? ORDER BY created_at").bind(u.userId).all<any>();
  const grouped=new Map<string,any[]>(); for(const w of waterRows.results||[]){const a=grouped.get(w.prayer_id)||[];a.push({userId:w.user_id,name:w.display_name,day:w.day,at:w.created_at});grouped.set(w.prayer_id,a)}
  const today=todaySeoul();
  for(const t of state.trees||[])for(const p of t.prayers||[]){p.waters=grouped.get(p.id)||[];p.watersCount=p.waters.length;p.wateredToday=p.waters.some((w:any)=>w.userId===u.userId&&w.day===today)}
  return json({state,displayName:u.fullName||u.email,userId:u.userId});
}

export async function PUT(request:Request) {
  if(!(await sameOrigin(request)))return json({error:"bad_origin"},403);
  const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);
  const payload=await body(request);const state=payload?.state;
  if(!state||!Array.isArray(state.trees)||state.trees.length>50)return json({error:"invalid_state"},400);
  const serialized=JSON.stringify(state);if(serialized.length>1_500_000)return json({error:"state_too_large"},413);
  const d=db(),now=isoNow();
  await d.prepare("INSERT INTO user_states(user_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at").bind(u.userId,serialized,now).run();
  const membership=await d.prepare("SELECT group_id FROM group_members WHERE user_id=?").bind(u.userId).all<{group_id:string}>();
  const allowed=new Set((membership.results||[]).map(x=>x.group_id));
  await d.prepare("DELETE FROM shared_prayers WHERE owner_id=?").bind(u.userId).run();
  await d.prepare("DELETE FROM shared_trees WHERE owner_id=?").bind(u.userId).run();
  const treeInserts:any[]=[];
  for(const t of state.trees){
    const groupIds=Array.isArray(t.sharedGroupIds)?t.sharedGroupIds.filter((id:string)=>allowed.has(id)):[];
    const friendShared=!!t.friendShared;
    if(!groupIds.length&&!friendShared)continue;
    const style=t.style||{};
    const safeStyle={species:String(style.species||"zelkova"),color:String(style.color||"sage"),flower:String(style.flower||"🌸"),fruit:String(style.fruit||"🍎"),growthMark:style.growthMark==="flower"?"flower":"leaf",timeBackground:!!style.timeBackground};
    const verse=t.verse&&typeof t.verse==="object"?{reference:String(t.verse.reference||"").slice(0,80),text:String(t.verse.text||"").slice(0,800)}:{};
    treeInserts.push(d.prepare("INSERT INTO shared_trees(id,owner_id,tree_id,owner_name,tree_name,style_json,verse_json,group_ids_json,friend_ids_json,friend_shared,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(`${u.userId}:${t.id}`,u.userId,t.id,String(t.name||u.fullName||u.email).slice(0,80),"기도나무",JSON.stringify(safeStyle),JSON.stringify(verse),JSON.stringify(groupIds),JSON.stringify(Array.isArray(t.sharedFriendIds)?t.sharedFriendIds:[]),friendShared?1:0,now));
  }
  for(let i=0;i<treeInserts.length;i+=60)await d.batch(treeInserts.slice(i,i+60));
  const inserts:any[]=[];
  for(const t of state.trees){for(const p of (Array.isArray(t.prayers)?t.prayers:[])){
    if(p.archived)continue;
    if(typeof p.text!=="string"||!p.id)continue;
    const visibility=p.visibility|| (p.private?"private":"private");
    const groupIds=Array.isArray(p.groupIds)?p.groupIds.filter((id:string)=>allowed.has(id)):[];
    const requestedFriends=Array.isArray(p.friendIds)?p.friendIds:[];const friendRows=requestedFriends.length?await d.prepare(`SELECT friend_id FROM friends WHERE user_id=? AND friend_id IN (${requestedFriends.map(()=>"?").join(",")})`).bind(u.userId,...requestedFriends).all<any>():{results:[]};const friendIds=(friendRows.results||[]).map((x:any)=>x.friend_id);const friendShared=!!p.friendShared||visibility==="friends";
    const finalVisibility=visibility==="public"?(groupIds.length&&friendIds.length?"friends_groups":groupIds.length?"groups":friendIds.length?"friends":"private"):groupIds.length&&friendIds.length?"friends_groups":groupIds.length?"groups":(friendShared||friendIds.length)?"friends":"private";
    inserts.push(d.prepare("INSERT INTO shared_prayers(id,owner_id,tree_id,owner_name,body,fruit,visibility,group_ids_json,friend_ids_json,friend_shared,category,harvested,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(`${u.userId}:${p.id}`,u.userId,t.id,String(t.name||u.fullName||u.email).slice(0,80),p.text,String(p.fruit||"🍎"),finalVisibility,JSON.stringify(groupIds),JSON.stringify(friendIds),friendShared?1:0,String(p.category||"").slice(0,40),p.harvested?1:0,p.createdAt||now,now));
  }}
  for(let i=0;i<inserts.length;i+=60)await d.batch(inserts.slice(i,i+60));
  return json({ok:true,updatedAt:now});
}
