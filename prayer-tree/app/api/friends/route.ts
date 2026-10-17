import { body, db, isoNow, json, requireUser, sameOrigin } from "@/lib/server";
import { notifyUser } from "@/lib/notifications";
export const dynamic = "force-dynamic";
async function accountName(d: ReturnType<typeof db>, userId: string, fallback = "기도나무 사용자") {
  const row = await d.prepare("SELECT state_json FROM user_states WHERE user_id=?").bind(userId).first<any>();
  try { const state=JSON.parse(row?.state_json||"{}"); return String(state.friendDisplayName||state.trees?.[0]?.name||fallback).slice(0,40); } catch { return fallback; }
}
async function createRequest(d: ReturnType<typeof db>, requesterId: string, recipientId: string, requesterName: string, recipientName: string, now: string): Promise<{ok?:true;error?:string}> {
  if(requesterId===recipientId) return {error:"self_invite"};
  if(await d.prepare("SELECT 1 FROM friends WHERE user_id=? AND friend_id=?").bind(requesterId,recipientId).first()) return {error:"already_friends"};
  const reverse=await d.prepare("SELECT status FROM friend_requests WHERE requester_id=? AND recipient_id=?").bind(recipientId,requesterId).first<any>();
  if(reverse?.status==="pending") return {error:"request_already_received"};
  const existing=await d.prepare("SELECT status FROM friend_requests WHERE requester_id=? AND recipient_id=?").bind(requesterId,recipientId).first<any>();
  if(existing?.status==="pending") return {error:"request_pending"};
  await d.prepare("INSERT INTO friend_requests(requester_id,recipient_id,requester_name,recipient_name,status,created_at,responded_at) VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(requester_id,recipient_id) DO UPDATE SET requester_name=excluded.requester_name,recipient_name=excluded.recipient_name,status='pending',created_at=excluded.created_at,responded_at=NULL").bind(requesterId,recipientId,requesterName,recipientName,"pending",now).run();
  await notifyUser({recipientId,actorId:requesterId,actorName:requesterName,kind:"friend_request",title:"새 친구 요청이 있어요",message:`${requesterName}님이 친구 요청을 보냈어요.`,link:"friends"});
  await notifyUser({recipientId,actorId:requesterId,actorName:requesterName,kind:"friend_request",title:"새 친구 요청이 있어요",message:`${requesterName}님이 친구 요청을 보냈어요.`,link:"friends"});
  return {ok:true};
}
export async function GET() {
  const u=await requireUser(); if(!u)return json({error:"sign_in_required"},401); const d=db();
  const [friends,incoming,outgoing,groupInvites]=await Promise.all([
    d.prepare("SELECT f.friend_id,f.friend_name,fa.alias,f.created_at,us.state_json FROM friends f LEFT JOIN friend_aliases fa ON fa.user_id=f.user_id AND fa.friend_id=f.friend_id LEFT JOIN user_states us ON us.user_id=f.friend_id WHERE f.user_id=? ORDER BY f.friend_name").bind(u.userId).all<any>(),
    d.prepare("SELECT requester_id,requester_name,created_at FROM friend_requests WHERE recipient_id=? AND status='pending' ORDER BY created_at").bind(u.userId).all<any>(),
    d.prepare("SELECT recipient_id,recipient_name,created_at FROM friend_requests WHERE requester_id=? AND status='pending' ORDER BY created_at").bind(u.userId).all<any>(),
    d.prepare("SELECT i.id,i.group_id,i.inviter_name,i.created_at,g.name AS group_name FROM group_friend_invites i JOIN prayer_groups g ON g.id=i.group_id WHERE i.friend_id=? AND i.status='pending_friend' ORDER BY i.created_at DESC").bind(u.userId).all<any>()
  ]);
  const display=(row:any)=>{try{const s=JSON.parse(row.state_json||"{}");return String(row.alias||s.friendDisplayName||s.trees?.[0]?.name||row.friend_name||"기도나무 사용자")}catch{return String(row.alias||row.friend_name||"기도나무 사용자")}};
  return json({friends:(friends.results||[]).map(x=>({id:x.friend_id,name:display(x),alias:x.alias||"",createdAt:x.created_at})),incomingRequests:(incoming.results||[]).map(x=>({id:x.requester_id,name:x.requester_name,createdAt:x.created_at})),outgoingRequests:(outgoing.results||[]).map(x=>({id:x.recipient_id,name:x.recipient_name,createdAt:x.created_at})),groupInvitations:(groupInvites.results||[]).map(x=>({id:x.id,groupId:x.group_id,groupName:x.group_name,inviterName:x.inviter_name,createdAt:x.created_at}))});
}
export async function POST(request:Request) {
  if(!(await sameOrigin(request)))return json({error:"bad_origin"},403);
  const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);
  const b=await body(request);if(!b)return json({error:"invalid_body"},400);
  const d=db(),now=isoNow(),myName=await accountName(d,u.userId,String(u.fullName||u.email||"기도나무 사용자").slice(0,40));
  if(b.action==="createInvite"){
    const token=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
    const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
    await d.prepare("INSERT INTO friend_invites(token,owner_id,owner_name,expires_at,accepted_by,created_at,accepted_at) VALUES(?,?,?,?,NULL,?,NULL)").bind(token,u.userId,myName,expiresAt,now).run(); return json({token,expiresAt});
  }
  if(b.action==="requestFriend"){
    const friendId=String(b.friendId||""); if(!friendId)return json({error:"missing_friend"},400);
    const friend=await d.prepare("SELECT friend_name FROM friends WHERE user_id=? AND friend_id=?").bind(u.userId,friendId).first<any>();
    if(friend)return json({error:"already_friends"},409);
    const recipientName=await accountName(d,friendId,"기도나무 사용자"); const result=await createRequest(d,u.userId,friendId,myName,recipientName,now);
    return result.error?json(result,409):json({ok:true});
  }
  if(b.action==="acceptInvite"){
    const token=String(b.token||"").replace(/[^A-F0-9]/gi,"").toUpperCase();if(!/^[A-F0-9]{12}$/.test(token))return json({error:"invalid_invite"},400);
    const invite=await d.prepare("SELECT owner_id,owner_name,expires_at,accepted_by FROM friend_invites WHERE token=?").bind(token).first<any>();
    if(!invite||Date.parse(invite.expires_at)<Date.now())return json({error:"invite_expired"},404);
    if(invite.owner_id===u.userId)return json({error:"self_invite"},400);
    if(invite.accepted_by&&invite.accepted_by!==u.userId)return json({error:"invite_used"},409);
    await d.prepare("UPDATE friend_invites SET accepted_by=?,accepted_at=? WHERE token=? AND (accepted_by IS NULL OR accepted_by=?)").bind(u.userId,now,token,u.userId).run();
    const result=await createRequest(d,u.userId,invite.owner_id,myName,invite.owner_name,now);
    if(result.error)return json(result,409);
    return json({ok:true,name:invite.owner_name,pendingAcceptance:true});
  }
  if(b.action==="acceptRequest"){
    const requesterId=String(b.friendId||""),r=await d.prepare("SELECT requester_name,recipient_name FROM friend_requests WHERE requester_id=? AND recipient_id=? AND status='pending'").bind(requesterId,u.userId).first<any>();
    if(!r)return json({error:"request_not_found"},404);
    await d.batch([
      d.prepare("UPDATE friend_requests SET status='accepted',responded_at=? WHERE requester_id=? AND recipient_id=? AND status='pending'").bind(now,requesterId,u.userId),
      d.prepare("INSERT OR IGNORE INTO friends(user_id,friend_id,friend_name,created_at) VALUES(?,?,?,?)").bind(u.userId,requesterId,r.requester_name,now),
      d.prepare("INSERT OR IGNORE INTO friends(user_id,friend_id,friend_name,created_at) VALUES(?,?,?,?)").bind(requesterId,u.userId,myName,now)
    ]); await notifyUser({recipientId:requesterId,actorId:u.userId,actorName:myName,kind:"friend_accepted",title:"친구 요청을 수락했어요",message:`${myName}님과 친구가 되었어요.`,link:"friends"}); return json({ok:true,name:r.requester_name});
  }
  if(b.action==="declineRequest"||b.action==="cancelRequest"){
    const friendId=String(b.friendId||"");
    const result=b.action==="declineRequest"
      ?await d.prepare("UPDATE friend_requests SET status='declined',responded_at=? WHERE requester_id=? AND recipient_id=? AND status='pending'").bind(now,friendId,u.userId).run()
      :await d.prepare("UPDATE friend_requests SET status='declined',responded_at=? WHERE requester_id=? AND recipient_id=? AND status='pending'").bind(now,u.userId,friendId).run();
    return json({ok:true,changed:result.meta.changes});
  }
  if(b.action==="updateAlias"){
    const friendId=String(b.friendId||""),alias=String(b.alias||"").trim().slice(0,40);
    if(!(await d.prepare("SELECT 1 FROM friends WHERE user_id=? AND friend_id=?").bind(u.userId,friendId).first()))return json({error:"not_friends"},403);
    if(alias)await d.prepare("INSERT INTO friend_aliases(user_id,friend_id,alias,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,friend_id) DO UPDATE SET alias=excluded.alias,updated_at=excluded.updated_at").bind(u.userId,friendId,alias,now).run();
    else await d.prepare("DELETE FROM friend_aliases WHERE user_id=? AND friend_id=?").bind(u.userId,friendId).run();
    return json({ok:true});
  }
  if(b.action==="remove"){
    const friendId=String(b.friendId||"");
    await d.batch([d.prepare("DELETE FROM friends WHERE user_id=? AND friend_id=?").bind(u.userId,friendId),d.prepare("DELETE FROM friends WHERE user_id=? AND friend_id=?").bind(friendId,u.userId),d.prepare("DELETE FROM friend_aliases WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)").bind(u.userId,friendId,friendId,u.userId)]);
    return json({ok:true});
  }
  return json({error:"unknown_action"},400);
}
