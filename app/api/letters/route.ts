import { body, db, isoNow, json, requireUser, sameOrigin, todaySeoul } from "@/lib/server";
import { notifyUser } from "@/lib/notifications";
export const dynamic="force-dynamic";
export async function GET(){
  const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const d=db();
  const [rows,own,received,drawn]=await Promise.all([
    d.prepare("SELECT l.id,l.author_id,l.author_name,l.anonymous,l.reference,l.verse,l.note,l.created_at,l.available_at,EXISTS(SELECT 1 FROM letter_reads r WHERE r.letter_id=l.id AND r.user_id=?) AS read_by_me FROM letters l ORDER BY l.created_at DESC LIMIT 300").bind(u.userId).all<any>(),
    d.prepare("SELECT id,author_name,anonymous,reference,verse,note,created_at,available_at FROM letters WHERE author_id=? ORDER BY created_at DESC LIMIT 200").bind(u.userId).all<any>(),
    d.prepare("SELECT r.id,r.letter_id,r.author_id,r.author_name,r.anonymous,r.body,r.created_at,l.reference,l.verse,l.note FROM letter_replies r JOIN letters l ON l.id=r.letter_id WHERE r.recipient_id=? ORDER BY r.created_at DESC LIMIT 200").bind(u.userId).all<any>(),
    d.prepare("SELECT 1 FROM daily_actions WHERE user_id=? AND action='letter_draw' AND day=?").bind(u.userId,todaySeoul()).first()
  ]);
  const ownIds=(own.results||[]).map(x=>x.id);let ownReplies:any[]=[];for(let i=0;i<ownIds.length;i+=80){const c=ownIds.slice(i,i+80);const part=await d.prepare(`SELECT id,letter_id,recipient_id,author_id,author_name,anonymous,body,created_at FROM letter_replies WHERE letter_id IN (${c.map(()=>"?").join(",")}) ORDER BY created_at DESC`).bind(...c).all<any>();ownReplies.push(...(part.results||[]))}
  const groupReplies=(xs:any[])=>{const m=new Map<string,any[]>();for(const x of xs){const a=m.get(x.letter_id)||[];a.push({id:x.id,recipientId:x.recipient_id,authorId:x.author_id,authorName:"익명",anonymous:true,body:x.body,createdAt:x.created_at});m.set(x.letter_id,a)}return m};const replies=groupReplies(ownReplies),receivedByLetter=groupReplies(received.results||[]);
  const fmt=(x:any,extra:any={})=>({id:x.id,writer:"익명",writerId:x.author_id,anonymous:true,reference:x.reference,verse:x.verse,note:x.note,createdAt:x.created_at,availableAt:x.available_at,readByMe:!!x.read_by_me,replies:extra.replies||[]});
  return json({drawnToday:!!drawn,letters:(rows.results||[]).map(x=>fmt(x,{replies:receivedByLetter.get(x.id)||[]})),myLetters:(own.results||[]).map(x=>fmt(x,{replies:replies.get(x.id)||[]})),receivedReplies:(received.results||[]).map(x=>({id:x.id,letterId:x.letter_id,authorId:x.author_id,authorName:"익명",anonymous:true,body:x.body,createdAt:x.created_at,reference:x.reference,verse:x.verse,note:x.note}))});
}
export async function POST(request:Request){
  if(!(await sameOrigin(request)))return json({error:"bad_origin"},403);const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);const b=await body(request);if(!b)return json({error:"invalid_body"},400);const d=db(),now=isoNow(),action=String(b.action||"create");
  if(action==="reply"){
    const letterId=String(b.letterId||""),text=String(b.body||"").trim();if(!letterId||!text||text.length>600)return json({error:"invalid_reply"},400);
    const letter=await d.prepare("SELECT author_id,author_name,reference FROM letters WHERE id=?").bind(letterId).first<any>();if(!letter)return json({error:"letter_not_found"},404);if(letter.author_id===u.userId)return json({error:"cannot_reply_to_own"},403);
    if(!(await d.prepare("SELECT 1 FROM letter_reads WHERE letter_id=? AND user_id=?").bind(letterId,u.userId).first()))return json({error:"letter_not_received"},403);
    const id=crypto.randomUUID(),anonymous=1,authorName="익명";
    await d.prepare("INSERT INTO letter_replies(id,letter_id,recipient_id,author_id,author_name,anonymous,body,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,letterId,u.userId,u.userId,authorName,anonymous,text,now).run();
    await notifyUser({recipientId:letter.author_id,actorId:u.userId,actorName:"익명",kind:"letter_reply",title:"받은 편지에 답장이 왔어요",message:"편지에 따뜻한 답장이 도착했어요.",link:"letters"});return json({ok:true,id});
  }
  if(action==="reply_update"){
    const id=String(b.id||""),text=String(b.body||"").trim();if(!id||!text||text.length>600)return json({error:"invalid_reply"},400);
    const r=await d.prepare("UPDATE letter_replies SET body=? WHERE id=? AND author_id=?").bind(text,id,u.userId).run();
    return r.meta.changes?json({ok:true}):json({error:"reply_not_found"},404);
  }
  if(action==="reply_delete"){
    const id=String(b.id||"");if(!id)return json({error:"invalid_reply"},400);
    const r=await d.prepare("DELETE FROM letter_replies WHERE id=? AND author_id=?").bind(id,u.userId).run();
    return r.meta.changes?json({ok:true}):json({error:"reply_not_found"},404);
  }
  if(action==="update"){
    const id=String(b.id||""),reference=String(b.reference||"").trim(),verse=String(b.verse||"").trim(),note=String(b.note||"").trim();if(!id||!reference||!verse||!note||reference.length>100||verse.length>1000||note.length>700)return json({error:"invalid_letter"},400);
    const r=await d.prepare("UPDATE letters SET author_name=?,anonymous=?,reference=?,verse=?,note=? WHERE id=? AND author_id=?").bind("익명",1,reference,verse,note,id,u.userId).run();return r.meta.changes?json({ok:true}):json({error:"letter_not_found"},404);
  }
  if(action==="delete"){
    const id=String(b.id||"");const r=await d.prepare("DELETE FROM letters WHERE id=? AND author_id=?").bind(id,u.userId).run();return r.meta.changes?json({ok:true}):json({error:"letter_not_found"},404);
  }
  if(action==="resurface"){
    const id=String(b.id||""),date=String(b.availableAt||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"invalid_date"},400);const at=new Date(`${date}T00:00:00+09:00`);if(!Number.isFinite(at.getTime()))return json({error:"invalid_date"},400);const value=at.toISOString();const r=await d.prepare("UPDATE letters SET available_at=? WHERE id=? AND author_id=?").bind(value,id,u.userId).run();return r.meta.changes?json({ok:true,availableAt:value}):json({error:"letter_not_found"},404);
  }
  if(action!=="create")return json({error:"unknown_action"},400);
  const reference=String(b.reference||"").trim(),verse=String(b.verse||"").trim(),note=String(b.note||"").trim();if(!reference||!verse||!note||reference.length>100||verse.length>1000||note.length>700)return json({error:"invalid_letter"},400);
  const createdAt=String(b.createdAt||now),id=String(b.id||crypto.randomUUID()).slice(0,100),writer="익명",availableAt=String(b.availableAt||createdAt);await d.prepare("INSERT OR IGNORE INTO letters(id,author_id,author_name,anonymous,reference,verse,note,created_at,available_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,u.userId,writer,1,reference,verse,note,createdAt,availableAt).run();return json({ok:true,id});
}
