import { db, isoNow } from "@/lib/server";
export async function getDisplayName(userId:string,fallback="기도나무 사용자") {
  try {
    const row=await db().prepare("SELECT state_json FROM user_states WHERE user_id=?").bind(userId).first<any>();
    const state=JSON.parse(row?.state_json||"{}");
    return String(state.friendDisplayName||state.trees?.[0]?.name||fallback).slice(0,40);
  } catch { return fallback; }
}
export async function notifyUser(input:{recipientId:string;actorId:string;actorName:string;kind:string;title:string;message:string;link?:string}) {
  if(!input.recipientId||input.recipientId===input.actorId)return;
  try {
    await db().prepare("INSERT INTO notifications(id,recipient_id,actor_id,actor_name,kind,title,message,link,created_at,read_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)")
      .bind(crypto.randomUUID(),input.recipientId,input.actorId,input.actorName.slice(0,80),input.kind,input.title.slice(0,100),input.message.slice(0,240),input.link||"",isoNow()).run();
  } catch { /* Notifications are best-effort; the requested action should still complete. */ }
}
