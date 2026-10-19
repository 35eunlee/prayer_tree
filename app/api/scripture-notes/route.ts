import { db, json, requireUser, body, sameOrigin, isoNow } from "@/lib/server";
export const dynamic="force-dynamic";
const BOOKS:Record<string,{name:string;count:number;testament:"OT"|"NT"}>={"gen":{"name":"창세기","count":50,"testament":"OT"},"exo":{"name":"출애굽기","count":40,"testament":"OT"},"lev":{"name":"레위기","count":27,"testament":"OT"},"num":{"name":"민수기","count":36,"testament":"OT"},"deu":{"name":"신명기","count":34,"testament":"OT"},"jos":{"name":"여호수아","count":24,"testament":"OT"},"jdg":{"name":"사사기","count":21,"testament":"OT"},"rut":{"name":"룻기","count":4,"testament":"OT"},"1sa":{"name":"사무엘상","count":31,"testament":"OT"},"2sa":{"name":"사무엘하","count":24,"testament":"OT"},"1ki":{"name":"열왕기상","count":22,"testament":"OT"},"2ki":{"name":"열왕기하","count":25,"testament":"OT"},"1ch":{"name":"역대상","count":29,"testament":"OT"},"2ch":{"name":"역대하","count":36,"testament":"OT"},"ezr":{"name":"에스라","count":10,"testament":"OT"},"neh":{"name":"느헤미야","count":13,"testament":"OT"},"est":{"name":"에스더","count":10,"testament":"OT"},"job":{"name":"욥기","count":42,"testament":"OT"},"psa":{"name":"시편","count":150,"testament":"OT"},"pro":{"name":"잠언","count":31,"testament":"OT"},"ecc":{"name":"전도서","count":12,"testament":"OT"},"sos":{"name":"아가","count":8,"testament":"OT"},"isa":{"name":"이사야","count":66,"testament":"OT"},"jer":{"name":"예레미야","count":52,"testament":"OT"},"lam":{"name":"예레미야애가","count":5,"testament":"OT"},"ezk":{"name":"에스겔","count":48,"testament":"OT"},"dan":{"name":"다니엘","count":12,"testament":"OT"},"hos":{"name":"호세아","count":14,"testament":"OT"},"jol":{"name":"요엘","count":3,"testament":"OT"},"amo":{"name":"아모스","count":9,"testament":"OT"},"oba":{"name":"오바댜","count":1,"testament":"OT"},"jon":{"name":"요나","count":4,"testament":"OT"},"mic":{"name":"미가","count":7,"testament":"OT"},"nah":{"name":"나훔","count":3,"testament":"OT"},"hab":{"name":"하박국","count":3,"testament":"OT"},"zep":{"name":"스바냐","count":3,"testament":"OT"},"hag":{"name":"학개","count":2,"testament":"OT"},"zec":{"name":"스가랴","count":14,"testament":"OT"},"mal":{"name":"말라기","count":4,"testament":"OT"},"mat":{"name":"마태복음","count":28,"testament":"NT"},"mrk":{"name":"마가복음","count":16,"testament":"NT"},"luk":{"name":"누가복음","count":24,"testament":"NT"},"jhn":{"name":"요한복음","count":21,"testament":"NT"},"act":{"name":"사도행전","count":28,"testament":"NT"},"rom":{"name":"로마서","count":16,"testament":"NT"},"1co":{"name":"고린도전서","count":16,"testament":"NT"},"2co":{"name":"고린도후서","count":13,"testament":"NT"},"gal":{"name":"갈라디아서","count":6,"testament":"NT"},"eph":{"name":"에베소서","count":6,"testament":"NT"},"php":{"name":"빌립보서","count":4,"testament":"NT"},"col":{"name":"골로새서","count":4,"testament":"NT"},"1th":{"name":"데살로니가전서","count":5,"testament":"NT"},"2th":{"name":"데살로니가후서","count":3,"testament":"NT"},"1ti":{"name":"디모데전서","count":6,"testament":"NT"},"2ti":{"name":"디모데후서","count":4,"testament":"NT"},"tit":{"name":"디도서","count":3,"testament":"NT"},"phm":{"name":"빌레몬서","count":1,"testament":"NT"},"heb":{"name":"히브리서","count":13,"testament":"NT"},"jas":{"name":"야고보서","count":5,"testament":"NT"},"1pe":{"name":"베드로전서","count":5,"testament":"NT"},"2pe":{"name":"베드로후서","count":3,"testament":"NT"},"1jn":{"name":"요한일서","count":5,"testament":"NT"},"2jn":{"name":"요한이서","count":1,"testament":"NT"},"3jn":{"name":"요한삼서","count":1,"testament":"NT"},"jud":{"name":"유다서","count":1,"testament":"NT"},"rev":{"name":"요한계시록","count":22,"testament":"NT"}};
type Scope={type:"private"|"group";id:string};
async function getScope(request:Request,userId:string):Promise<Scope|null>{
 const url=new URL(request.url),type=url.searchParams.get("scopeType")==="group"?"group":"private";
 if(type==="private")return {type:"private",id:userId};
 const id=(url.searchParams.get("scopeId")||"").slice(0,80);if(!id)return null;
 const member=await db().prepare("SELECT 1 AS ok FROM group_members WHERE group_id=? AND user_id=?").bind(id,userId).first();
 return member?{type:"group",id}:null;
}
async function scopeFromBody(data:any,userId:string):Promise<Scope|null>{
 const type=data.scopeType==="group"?"group":"private";
 if(type==="private")return {type:"private",id:userId};
 const id=String(data.scopeId||"").slice(0,80);if(!id)return null;
 const member=await db().prepare("SELECT 1 AS ok FROM group_members WHERE group_id=? AND user_id=?").bind(id,userId).first();
 return member?{type:"group",id}:null;
}
export async function GET(request:Request){
 const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);
 const scope=await getScope(request,u.userId);if(!scope)return json({error:"group_not_found_or_forbidden"},403);
 const url=new URL(request.url),bookId=url.searchParams.get("bookId")||"",chapterNo=Number(url.searchParams.get("chapter")||0),d=db();
 const chapters=await d.prepare("SELECT id,book_id AS bookId,chapter,created_at AS createdAt FROM scripture_chapters WHERE scope_type=? AND scope_id=? ORDER BY book_id,chapter").bind(scope.type,scope.id).all();
 const progress=await d.prepare("SELECT book_id AS bookId,chapter,read_at AS readAt FROM scripture_reading_progress WHERE user_id=? AND scope_type=? AND scope_id=?").bind(u.userId,scope.type,scope.id).all();
 let chapterRow:any=null,meditations:any[]=[];
 if(BOOKS[bookId]&&Number.isInteger(chapterNo)&&chapterNo>0&&chapterNo<=BOOKS[bookId].count){
  chapterRow=await d.prepare("SELECT id,book_id AS bookId,book_name AS bookName,chapter,scripture_text AS scriptureText,created_by AS createdBy,creator_name AS creatorName,created_at AS createdAt FROM scripture_chapters WHERE scope_type=? AND scope_id=? AND book_id=? AND chapter=?").bind(scope.type,scope.id,bookId,chapterNo).first();
  if(chapterRow){const n=await d.prepare("SELECT id,user_id AS userId,author_name AS authorName,body,is_seed AS isSeed,created_at AS createdAt FROM scripture_meditations WHERE chapter_id=? ORDER BY created_at,id").bind(chapterRow.id).all();meditations=n.results||[]}
 }
 return json({scope,chapters:chapters.results||[],progress:progress.results||[],chapter:chapterRow,meditations});
}
export async function POST(request:Request){
 if(!await sameOrigin(request))return json({error:"invalid_origin"},403);
 const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);
 const data=await body(request);if(!data)return json({error:"invalid_body"},400);
 const scope=await scopeFromBody(data,u.userId);if(!scope)return json({error:"group_not_found_or_forbidden"},403);
 const action=String(data.action||""),d=db();
 if(action==="createChapter"){
  const bookId=String(data.bookId||""),book=BOOKS[bookId],chapter=Number(data.chapter),scripture=String(data.scriptureText||"").trim(),meditation=String(data.meditation||"").trim();
  if(!book||Number(data.chapter)!==chapter||!Number.isInteger(chapter)||chapter<1||chapter>book.count||scripture.length<20||scripture.length>30000||meditation.length<2||meditation.length>3000)return json({error:"chapter_and_meditation_required"},400);
  const chapterId=crypto.randomUUID(),noteId=crypto.randomUUID(),now=isoNow(),author=String(u.displayName||"말씀나무 사용자").trim().slice(0,40)||"말씀나무 사용자";
  try{
   await d.batch([
    d.prepare("INSERT INTO scripture_chapters (id,scope_type,scope_id,book_id,book_name,chapter,scripture_text,created_by,creator_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(chapterId,scope.type,scope.id,bookId,book.name,chapter,scripture,u.userId,author,now,now),
    d.prepare("INSERT INTO scripture_meditations (id,chapter_id,user_id,author_name,body,is_seed,created_at) VALUES (?,?,?,?,?,1,?)").bind(noteId,chapterId,u.userId,author,meditation,now)
   ]);
  }catch(error){if(String(error).includes("UNIQUE constraint failed"))return json({error:"chapter_already_created"},409);throw error}
  return json({ok:true,chapterId});
 }
 if(action==="meditation"){
  const chapterId=String(data.chapterId||""),meditation=String(data.meditation||"").trim();
  if(!chapterId||meditation.length<2||meditation.length>3000)return json({error:"invalid_meditation"},400);
  const chapter=await d.prepare("SELECT id FROM scripture_chapters WHERE id=? AND scope_type=? AND scope_id=?").bind(chapterId,scope.type,scope.id).first();
  if(!chapter)return json({error:"chapter_not_found"},404);
  const id=crypto.randomUUID(),now=isoNow(),author=String(u.displayName||"말씀나무 사용자").trim().slice(0,40)||"말씀나무 사용자";
  await d.prepare("INSERT INTO scripture_meditations (id,chapter_id,user_id,author_name,body,is_seed,created_at) VALUES (?,?,?,?,?,0,?)").bind(id,chapterId,u.userId,author,meditation,now).run();
  return json({ok:true,id});
 }
 if(action==="progress"){
  const bookId=String(data.bookId||""),book=BOOKS[bookId],chapter=Number(data.chapter),read=!!data.read;
  if(!book||!Number.isInteger(chapter)||chapter<1||chapter>book.count)return json({error:"invalid_progress"},400);
  if(read)await d.prepare("INSERT OR IGNORE INTO scripture_reading_progress (user_id,scope_type,scope_id,book_id,chapter,read_at) VALUES (?,?,?,?,?,?)").bind(u.userId,scope.type,scope.id,bookId,chapter,isoNow()).run();
  else await d.prepare("DELETE FROM scripture_reading_progress WHERE user_id=? AND scope_type=? AND scope_id=? AND book_id=? AND chapter=?").bind(u.userId,scope.type,scope.id,bookId,chapter).run();
  return json({ok:true});
 }
 return json({error:"unknown_action"},400);
}
export async function DELETE(request:Request){
 if(!await sameOrigin(request))return json({error:"invalid_origin"},403);
 const u=await requireUser();if(!u)return json({error:"sign_in_required"},401);
 const data=await body(request);const id=String(data?.id||"");if(!id)return json({error:"invalid_id"},400);
 await db().prepare("DELETE FROM scripture_meditations WHERE id=? AND user_id=? AND is_seed=0").bind(id,u.userId).run();
 return json({ok:true});
}