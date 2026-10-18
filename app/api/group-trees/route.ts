import { db, json, requireUser, todaySeoul } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const d=db(),groupId=new URL(request.url).searchParams.get("groupId")||"",day=todaySeoul();
 const memberships=await d.prepare("SELECT group_id FROM group_members WHERE user_id=?").bind(u.userId).all<any>(),groupIds=(memberships.results||[]).map((x:any)=>x.group_id);
 if(groupId&&!groupIds.includes(groupId))return json({error:"forbidden"},403);
 const fs=await d.prepare("SELECT friend_id FROM friends WHERE user_id=?").bind(u.userId).all<any>(),friendIds=(fs.results||[]).map((x:any)=>x.friend_id);
 const clauses:string[]=[],args:any[]=[];
 if(groupId){clauses.push("EXISTS(SELECT 1 FROM json_each(s.group_ids_json) j WHERE j.value=?)");args.push(groupId)}
 else {
  if(groupIds.length){clauses.push(`EXISTS(SELECT 1 FROM json_each(s.group_ids_json) j WHERE j.value IN (${groupIds.map(()=>"?").join(",")}))`);args.push(...groupIds)}
  if(friendIds.length){clauses.push("(s.friend_shared=1 OR EXISTS(SELECT 1 FROM json_each(s.friend_ids_json) j WHERE j.value=?))");args.push(u.userId)}
 }
 if(!clauses.length)return json({trees:[]});
 const rows=await d.prepare(`SELECT s.owner_id,s.tree_id,s.owner_name,s.tree_name,s.style_json,s.verse_json,s.group_ids_json,s.friend_ids_json,s.friend_shared,s.updated_at FROM shared_trees s WHERE s.owner_id<>? AND (${clauses.join(" OR ")}) ORDER BY s.owner_name,s.tree_name`).bind(u.userId,...args).all<any>();
 const owners=[...new Set((rows.results||[]).map((r:any)=>r.owner_id))];const stateMap=new Map<string,any>();for(let i=0;i<owners.length;i+=80){const chunk=owners.slice(i,i+80),states=await d.prepare(`SELECT user_id,state_json FROM user_states WHERE user_id IN (${chunk.map(()=>"?").join(",")})`).bind(...chunk).all<any>();for(const row of states.results||[]){try{stateMap.set(row.user_id,JSON.parse(row.state_json))}catch{}}}
 const trees=await Promise.all((rows.results||[]).map(async(row:any)=>{
   const gIds=JSON.parse(row.group_ids_json||"[]"),fIds=JSON.parse(row.friend_ids_json||"[]"),shareAllFriends=!!row.friend_shared;
   const prayerRows=await d.prepare("SELECT p.id,p.body,p.fruit,p.visibility,p.group_ids_json,p.friend_ids_json,p.friend_shared,p.category,p.harvested,p.created_at,(SELECT COUNT(*) FROM waters w WHERE w.owner_id=p.owner_id AND w.prayer_id=substr(p.id,length(p.owner_id)+2)) AS water_count,EXISTS(SELECT 1 FROM waters w WHERE w.owner_id=p.owner_id AND w.prayer_id=substr(p.id,length(p.owner_id)+2) AND w.user_id=? AND w.day=?) AS watered_today,(SELECT COUNT(*) FROM group_comments c WHERE c.prayer_id=p.id) AS comment_count FROM shared_prayers p WHERE p.owner_id=? AND p.tree_id=? ORDER BY p.created_at DESC LIMIT 100").bind(u.userId,day,row.owner_id,row.tree_id).all<any>();
   const state=stateMap.get(row.owner_id),treeState=(state?.trees||[]).find((t:any)=>t.id===row.tree_id);let style={},verse={};try{style=JSON.parse(row.style_json||"{}")}catch{}try{verse=JSON.parse(row.verse_json||"{}")}catch{}
   const prayers=(prayerRows.results||[]).filter((p:any)=>{if(groupId)return (p.visibility==="groups"||p.visibility==="friends_groups")&&JSON.parse(p.group_ids_json||"[]").includes(groupId);const pGroups=JSON.parse(p.group_ids_json||"[]"),pFriends=JSON.parse(p.friend_ids_json||"[]");return pGroups.some((id:string)=>groupIds.includes(id))||((p.friend_shared||(p.visibility==="friends"&&!pFriends.length)||shareAllFriends||pFriends.includes(u.userId))&&friendIds.includes(row.owner_id))}).map((p:any)=>{const local=(treeState?.prayers||[]).find((x:any)=>x.id===p.id.slice(String(p.owner_id).length+1));return {id:p.id.slice(String(p.owner_id).length+1),sharedId:p.id,ownerId:row.owner_id,ownerAccountId:row.owner_id,treeId:row.tree_id,text:p.body,category:p.category||local?.category||"",fruit:p.fruit,harvested:!!p.harvested,createdAt:p.created_at,harvestedAt:local?.harvestedAt||null,answerNote:"",waterCount:Number(p.water_count),watersCount:Number(p.water_count),wateredToday:!!p.watered_today,commentCount:Number(p.comment_count)}});
   const canSeeTree=!!groupId?gIds.includes(groupId):(gIds.some((id:string)=>groupIds.includes(id))||(shareAllFriends&&friendIds.includes(row.owner_id))||fIds.includes(u.userId));
   if(!canSeeTree)return null;return {ownerId:row.owner_id,treeId:row.tree_id,ownerName:row.owner_name,treeName:row.tree_name,style,verse,prayerCount:prayers.length,prayers};
 }));
 if(groupId){
  const members=await d.prepare("SELECT m.user_id,s.state_json FROM group_members m LEFT JOIN user_states s ON s.user_id=m.user_id WHERE m.group_id=? ORDER BY m.joined_at").bind(groupId).all<any>();
  const memberTrees=[];
  for(const member of members.results||[]){
   let state:any={};try{state=JSON.parse(member.state_json||"{}")}catch{}
   const t=(state.trees||[])[0];if(!t)continue;
   const treeId=String(t.id||""),ownerId=String(member.user_id);
   const shared=await d.prepare("SELECT p.id,p.body,p.fruit,p.category,p.harvested,p.created_at,(SELECT COUNT(*) FROM waters w WHERE w.owner_id=p.owner_id AND w.prayer_id=substr(p.id,length(p.owner_id)+2)) AS water_count,EXISTS(SELECT 1 FROM waters w WHERE w.owner_id=p.owner_id AND w.prayer_id=substr(p.id,length(p.owner_id)+2) AND w.user_id=? AND w.day=?) AS watered_today FROM shared_prayers p WHERE p.owner_id=? AND p.tree_id=? AND p.visibility IN ('groups','friends_groups') AND EXISTS(SELECT 1 FROM json_each(p.group_ids_json) j WHERE j.value=?) ORDER BY p.created_at DESC LIMIT 100").bind(u.userId,day,ownerId,treeId,groupId).all<any>();
   const prayers=(shared.results||[]).map((p:any)=>({id:p.id.slice(String(p.owner_id).length+1),sharedId:p.id,ownerId,ownerAccountId:ownerId,treeId,text:p.body,category:p.category||"",harvested:!!p.harvested,createdAt:p.created_at,waterCount:Number(p.water_count||0),watersCount:Number(p.water_count||0),wateredToday:!!p.watered_today}));
   memberTrees.push({ownerId,treeId,ownerName:String(state.friendDisplayName||t.name||"기도나무 사용자"),treeName:String(t.name||"기도나무"),style:t.style||{},verse:t.verse||{},prayerCount:prayers.length,prayers});
  }
  return json({trees:trees.filter(Boolean),memberTrees});
 }
 return json({trees:trees.filter(Boolean)});
}
