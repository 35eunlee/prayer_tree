import { body, db, isoNow, json, requireUser, sameOrigin, todaySeoul } from "@/lib/server";
import { notifyUser } from "@/lib/notifications";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const u=await requireUser();
  if(!u)return json({error:"sign_in_required"},401);
  const prayerId=new URL(request.url).searchParams.get("prayerId")||"";
  if(!prayerId)return json({error:"invalid_prayer"},400);
  const d=db();
  const stateRow=await d.prepare("SELECT state_json FROM user_states WHERE user_id=?").bind(u.userId).first<any>();
  let state:any=null;
  try{state=JSON.parse(String(stateRow?.state_json||"null"))}catch{}
  const ownsPrayer=(state?.trees||[]).some((tree:any)=>(tree.prayers||[]).some((prayer:any)=>String(prayer.id)===prayerId));
  if(!ownsPrayer)return json({error:"prayer_not_found"},404);
  const rows=await d.prepare("SELECT user_id,display_name,COUNT(*) AS prayer_count FROM waters WHERE owner_id=? AND prayer_id=? GROUP BY user_id,display_name ORDER BY MIN(created_at) ASC").bind(u.userId,prayerId).all<any>();
  const people=(rows.results||[]).map((row:any)=>({userId:String(row.user_id),displayName:String(row.display_name||"함께 기도한 이웃"),prayerCount:Number(row.prayer_count||0)}));
  const total=people.reduce((sum:any,person:any)=>sum+person.prayerCount,0);
  const sharedTotal=people.filter((person:any)=>person.userId!==u.userId).reduce((sum:any,person:any)=>sum+person.prayerCount,0);
  const days=await d.prepare("SELECT COUNT(DISTINCT day) AS day_count FROM waters WHERE owner_id=? AND prayer_id=?").bind(u.userId,prayerId).first<any>();
  return json({ok:true,prayerCount:total,sharedPrayerCount:sharedTotal,wateringDays:Number(days?.day_count||0),peopleCount:people.length,people});
}

export async function POST(request:Request){
  if(!(await sameOrigin(request)))return json({error:"bad_origin"},403);
  const u=await requireUser();
  if(!u)return json({error:"sign_in_required"},401);
  const b=await body(request);
  let ownerId=String(b?.ownerId||""),prayerId=String(b?.prayerId||"");
  const sharedId=String(b?.sharedId||"");
  if(!ownerId||!prayerId)return json({error:"invalid_prayer"},400);
  const d=db();
  // Resolve shared prayers by their canonical row ID; UI owner metadata can be stale.
  const selectPrayer=(id:string)=>d.prepare("SELECT id,owner_id,visibility,group_ids_json,friend_shared,friend_ids_json FROM shared_prayers WHERE id=?").bind(id).first<any>();
  let p=sharedId?await selectPrayer(sharedId):null;
  // If an old or stale client sends a noncanonical shared ID, try the
  // owner/prayer pair too before reporting that the prayer is missing.
  const prayerKey=prayerId.slice(prayerId.lastIndexOf(":")+1);
  if(!p)p=await selectPrayer(`${ownerId}:${prayerKey}`);
  if(!p&&sharedId.startsWith(`${ownerId}:`)){
    const suffix=sharedId.slice(ownerId.length+1);
    p=await selectPrayer(`${ownerId}:${suffix.slice(suffix.lastIndexOf(":")+1)}`);
  }
  if(!p&&sharedId.includes(":")){
    const separator=sharedId.lastIndexOf(":");
    const sharedOwner=sharedId.slice(0,separator),sharedPrayer=sharedId.slice(separator+1);
    if(sharedOwner&&sharedPrayer)p=await selectPrayer(`${sharedOwner}:${sharedPrayer}`);
  }
  if(!p&&sharedId.includes(":")){
    const separator=sharedId.lastIndexOf(":");
    const sharedOwner=sharedId.slice(0,separator),sharedPrayer=sharedId.slice(separator+1);
    if(sharedOwner&&sharedPrayer){ownerId=sharedOwner;prayerId=sharedPrayer}
  }
  if(!p){
    // Older group cards may send the tree ID where the account ID is expected.
    // Resolve by prayer ID only when this user can already view the matching share.
    const matches=await d.prepare("SELECT id,owner_id,visibility,group_ids_json,friend_shared,friend_ids_json FROM shared_prayers WHERE substr(id,length(owner_id)+2)=? LIMIT 50").bind(prayerKey).all<any>();
    for(const candidate of matches.results||[]){
      const candidateOwner=String(candidate.owner_id);
      let visible=candidateOwner===u.userId;
      if(!visible&&(candidate.visibility==="groups"||candidate.visibility==="friends_groups")){
        for(const id of JSON.parse(candidate.group_ids_json||"[]")){
          if(await d.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").bind(id,u.userId).first()){visible=true;break}
        }
      }
      if(!visible&&(candidate.visibility==="friends"||candidate.visibility==="friends_groups")&&
        (candidate.friend_shared||(candidate.visibility==="friends"&&!JSON.parse(candidate.friend_ids_json||"[]").length)||JSON.parse(candidate.friend_ids_json||"[]").includes(u.userId))){
        visible=!!(await d.prepare("SELECT 1 FROM friends WHERE user_id=? AND friend_id=?").bind(u.userId,candidateOwner).first());
      }
      if(visible){p=candidate;break}
    }
  }
  if(p){
    ownerId=String(p.owner_id);
    prayerId=String(p.id).slice(String(p.owner_id).length+1);
  }
  // A shared prayer may briefly be absent from the projection table while its
  // owner state is being refreshed. Recover its share rules from the saved state.
  if(!p&&ownerId!==u.userId){
    const stateRow=await d.prepare("SELECT state_json FROM user_states WHERE user_id=?").bind(ownerId).first<any>();
    let state:any=null;
    try{state=JSON.parse(String(stateRow?.state_json||"null"))}catch{}
    let savedPrayer:any=null;
    for(const tree of state?.trees||[]){
      savedPrayer=(tree.prayers||[]).find((item:any)=>String(item.id)===prayerKey);
      if(savedPrayer)break;
    }
    if(!savedPrayer)return json({error:"prayer_not_found"},404);
    const groupIds=Array.isArray(savedPrayer.groupIds)?savedPrayer.groupIds:[];
    const friendIds=Array.isArray(savedPrayer.friendIds)?savedPrayer.friendIds:[];
    const savedVisibility=String(savedPrayer.visibility||"");
    const friendShared=!!savedPrayer.friendShared||savedVisibility==="friends";
    p={
      owner_id:ownerId,
      visibility:groupIds.length?(friendShared||friendIds.length?"friends_groups":"groups"):(friendShared||friendIds.length?"friends":"private"),
      group_ids_json:JSON.stringify(groupIds),
      friend_ids_json:JSON.stringify(friendIds),
      friend_shared:friendShared?1:0
    };
  }
  let allowed=ownerId===u.userId;
  if(!allowed&&p&&(p.visibility==="groups"||p.visibility==="friends_groups")){
    const ids=JSON.parse(p.group_ids_json||"[]");
    for(const id of ids){
      if(await d.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").bind(id,u.userId).first()){allowed=true;break}
    }
  }
  if(!allowed&&p&&(p.visibility==="friends"||p.visibility==="friends_groups")&&
    (p.friend_shared||(p.visibility==="friends"&&!JSON.parse(p.friend_ids_json||"[]").length)||JSON.parse(p.friend_ids_json||"[]").includes(u.userId))){
    allowed=!!(await d.prepare("SELECT 1 FROM friends WHERE user_id=? AND friend_id=?").bind(u.userId,ownerId).first());
  }
  if(!allowed)return json({error:"forbidden"},403);
  const day=todaySeoul(),now=isoNow();
  const result=await d.prepare("INSERT OR IGNORE INTO waters(prayer_id,owner_id,user_id,display_name,day,created_at) VALUES(?,?,?,?,?,?)")
    .bind(prayerId,ownerId,u.userId,String(b.displayName||u.fullName||u.email).slice(0,80),day,now).run();
  if(result.meta.changes&&ownerId!==u.userId)await notifyUser({recipientId:ownerId,actorId:u.userId,actorName:String(b.displayName||u.fullName||u.email||"친구"),kind:"water",title:"기도제목에 물을 주었어요",message:"친구가 함께 기도하며 물을 주었어요.",link:"together"});
  const count=await d.prepare("SELECT COUNT(*) AS n FROM waters WHERE prayer_id=? AND owner_id=?").bind(prayerId,ownerId).first<any>();
  const watered=await d.prepare("SELECT 1 FROM waters WHERE prayer_id=? AND owner_id=? AND user_id=? AND day=?").bind(prayerId,ownerId,u.userId,day).first();
  return json({ok:true,already:!result.meta.changes,count:Number(count?.n||0),wateredToday:!!watered,ownerId,prayerId});
}