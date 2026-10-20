import { db, json, requireUser, body, sameOrigin, isoNow } from "@/lib/server";
export const dynamic = "force-dynamic";

async function prayerDisplayName(userId:string,fallback:string){const row=await db().prepare("SELECT state_json FROM user_states WHERE user_id=?").bind(userId).first<any>();try{const state=JSON.parse(row?.state_json||"{}");return String(state.friendDisplayName||state.trees?.[0]?.name||fallback||"기도나무 사용자").trim().slice(0,40)||"기도나무 사용자"}catch{return String(fallback||"기도나무 사용자").trim().slice(0,40)||"기도나무 사용자"}}

const BOOKS: Record<string, { name: string; count: number; testament: "OT" | "NT" }> = {"gen":{"name":"창세기","count":50,"testament":"OT"},"exo":{"name":"출애굽기","count":40,"testament":"OT"},"lev":{"name":"레위기","count":27,"testament":"OT"},"num":{"name":"민수기","count":36,"testament":"OT"},"deu":{"name":"신명기","count":34,"testament":"OT"},"jos":{"name":"여호수아","count":24,"testament":"OT"},"jdg":{"name":"사사기","count":21,"testament":"OT"},"rut":{"name":"룻기","count":4,"testament":"OT"},"1sa":{"name":"사무엘상","count":31,"testament":"OT"},"2sa":{"name":"사무엘하","count":24,"testament":"OT"},"1ki":{"name":"열왕기상","count":22,"testament":"OT"},"2ki":{"name":"열왕기하","count":25,"testament":"OT"},"1ch":{"name":"역대상","count":29,"testament":"OT"},"2ch":{"name":"역대하","count":36,"testament":"OT"},"ezr":{"name":"에스라","count":10,"testament":"OT"},"neh":{"name":"느헤미야","count":13,"testament":"OT"},"est":{"name":"에스더","count":10,"testament":"OT"},"job":{"name":"욥기","count":42,"testament":"OT"},"psa":{"name":"시편","count":150,"testament":"OT"},"pro":{"name":"잠언","count":31,"testament":"OT"},"ecc":{"name":"전도서","count":12,"testament":"OT"},"sos":{"name":"아가","count":8,"testament":"OT"},"isa":{"name":"이사야","count":66,"testament":"OT"},"jer":{"name":"예레미야","count":52,"testament":"OT"},"lam":{"name":"예레미야애가","count":5,"testament":"OT"},"ezk":{"name":"에스겔","count":48,"testament":"OT"},"dan":{"name":"다니엘","count":12,"testament":"OT"},"hos":{"name":"호세아","count":14,"testament":"OT"},"jol":{"name":"요엘","count":3,"testament":"OT"},"amo":{"name":"아모스","count":9,"testament":"OT"},"oba":{"name":"오바댜","count":1,"testament":"OT"},"jon":{"name":"요나","count":4,"testament":"OT"},"mic":{"name":"미가","count":7,"testament":"OT"},"nah":{"name":"나훔","count":3,"testament":"OT"},"hab":{"name":"하박국","count":3,"testament":"OT"},"zep":{"name":"스바냐","count":3,"testament":"OT"},"hag":{"name":"학개","count":2,"testament":"OT"},"zec":{"name":"스가랴","count":14,"testament":"OT"},"mal":{"name":"말라기","count":4,"testament":"OT"},"mat":{"name":"마태복음","count":28,"testament":"NT"},"mrk":{"name":"마가복음","count":16,"testament":"NT"},"luk":{"name":"누가복음","count":24,"testament":"NT"},"jhn":{"name":"요한복음","count":21,"testament":"NT"},"act":{"name":"사도행전","count":28,"testament":"NT"},"rom":{"name":"로마서","count":16,"testament":"NT"},"1co":{"name":"고린도전서","count":16,"testament":"NT"},"2co":{"name":"고린도후서","count":13,"testament":"NT"},"gal":{"name":"갈라디아서","count":6,"testament":"NT"},"eph":{"name":"에베소서","count":6,"testament":"NT"},"php":{"name":"빌립보서","count":4,"testament":"NT"},"col":{"name":"골로새서","count":4,"testament":"NT"},"1th":{"name":"데살로니가전서","count":5,"testament":"NT"},"2th":{"name":"데살로니가후서","count":3,"testament":"NT"},"1ti":{"name":"디모데전서","count":6,"testament":"NT"},"2ti":{"name":"디모데후서","count":4,"testament":"NT"},"tit":{"name":"디도서","count":3,"testament":"NT"},"phm":{"name":"빌레몬서","count":1,"testament":"NT"},"heb":{"name":"히브리서","count":13,"testament":"NT"},"jas":{"name":"야고보서","count":5,"testament":"NT"},"1pe":{"name":"베드로전서","count":5,"testament":"NT"},"2pe":{"name":"베드로후서","count":3,"testament":"NT"},"1jn":{"name":"요한일서","count":5,"testament":"NT"},"2jn":{"name":"요한이서","count":1,"testament":"NT"},"3jn":{"name":"요한삼서","count":1,"testament":"NT"},"jud":{"name":"유다서","count":1,"testament":"NT"},"rev":{"name":"요한계시록","count":22,"testament":"NT"}};
type ScopeType = "private" | "group" | "friends" | "shared";
type Scope = { type: ScopeType; id: string };
const databaseScopeType = (scope: Scope) => scope.type === "shared" ? "friends" : scope.type;

async function canReadSharedBook(ownerId: string, userId: string) {
  return !!await db().prepare(`SELECT 1 AS ok FROM scripture_chapter_access a
    JOIN scripture_chapters c ON c.id=a.chapter_id
    JOIN friends f ON f.user_id=c.scope_id AND f.friend_id=a.user_id
    WHERE c.scope_type='friends' AND c.scope_id=? AND a.user_id=? LIMIT 1`).bind(ownerId,userId).first();
}

async function getScope(typeValue: string, idValue: string | null, userId: string): Promise<Scope | null> {
  const type: ScopeType = ["group","friends","shared"].includes(typeValue) ? typeValue as ScopeType : "private";
  if (type === "private") return { type, id: userId };
  const id = String(idValue || "").slice(0, 100);
  if (type === "friends") return id === userId ? { type, id } : null;
  if (type === "shared") return id && await canReadSharedBook(id,userId) ? { type, id } : null;
  if (!id) return null;
  const member = await db().prepare("SELECT 1 AS ok FROM group_members WHERE group_id=? AND user_id=?").bind(id,userId).first();
  return member ? { type, id } : null;
}

async function scopeFromBody(data: Record<string,any>, userId: string): Promise<Scope | null> {
  return getScope(String(data.scopeType || "private"),String(data.scopeId || ""),userId);
}

async function getSharedBooks(userId: string) {
  const rows = await db().prepare(`SELECT c.scope_id AS ownerId,
    COALESCE(NULLIF(json_extract(s.state_json,'$.friendDisplayName'),''),NULLIF(json_extract(s.state_json,'$.trees[0].name'),''),'기도나무 사용자') AS ownerName,
    COUNT(DISTINCT c.id) AS chapterCount
    FROM scripture_chapters c
    JOIN scripture_chapter_access a ON a.chapter_id=c.id
    JOIN friends f ON f.user_id=c.scope_id AND f.friend_id=a.user_id
    LEFT JOIN user_states s ON s.user_id=c.scope_id
    WHERE c.scope_type='friends' AND a.user_id=?
    GROUP BY c.scope_id ORDER BY ownerName`).bind(userId).all<any>();
  return (rows.results || []).map((row:any)=>({ownerId:row.ownerId,ownerName:row.ownerName,chapterCount:Number(row.chapterCount)}));
}


async function validateScriptureTargets(d: ReturnType<typeof db>,userId:string,groupIds:string[],friendIds:string[]){
  const groups=[...new Set(groupIds.map(x=>String(x).slice(0,100)).filter(Boolean))].slice(0,30),friends=[...new Set(friendIds.map(x=>String(x).slice(0,150)).filter(Boolean))].slice(0,30);
  if(groups.length){const rows=await d.prepare(`SELECT group_id FROM group_members WHERE user_id=? AND group_id IN (${groups.map(()=>"?").join(",")})`).bind(userId,...groups).all<any>();if((rows.results||[]).length!==groups.length)return null}
  if(friends.length){const rows=await d.prepare(`SELECT friend_id FROM friends WHERE user_id=? AND friend_id IN (${friends.map(()=>"?").join(",")})`).bind(userId,...friends).all<any>();if((rows.results||[]).length!==friends.length)return null}
  return {groups,friends};
}
async function scriptureSyncGroup(d: ReturnType<typeof db>,userId:string,bookId:string,chapter:number){
  let row=await d.prepare("SELECT id FROM scripture_chapter_sync_groups WHERE owner_id=? AND book_id=? AND chapter=?").bind(userId,bookId,chapter).first<any>();
  if(!row){const id=crypto.randomUUID();await d.prepare("INSERT OR IGNORE INTO scripture_chapter_sync_groups(id,owner_id,book_id,chapter,created_at) VALUES(?,?,?,?,?)").bind(id,userId,bookId,chapter,isoNow()).run();row=await d.prepare("SELECT id FROM scripture_chapter_sync_groups WHERE owner_id=? AND book_id=? AND chapter=?").bind(userId,bookId,chapter).first<any>()}
  return row?.id as string;
}
async function linkScriptureChapter(d: ReturnType<typeof db>,userId:string,sourceId:string,targetId:string){
  const source=await d.prepare("SELECT book_id AS bookId,chapter FROM scripture_chapters WHERE id=?").bind(sourceId).first<any>();if(!source)return;
  const groupId=await scriptureSyncGroup(d,userId,source.bookId,Number(source.chapter));
  await d.prepare("UPDATE scripture_chapter_sync_groups SET source_chapter_id=COALESCE(source_chapter_id,?) WHERE id=?").bind(sourceId,groupId).run();
  await d.prepare("INSERT OR IGNORE INTO scripture_chapter_sync_members(sync_group_id,chapter_id) VALUES(?,?)").bind(groupId,sourceId).run();
  await d.prepare("INSERT OR IGNORE INTO scripture_chapter_sync_members(sync_group_id,chapter_id) VALUES(?,?)").bind(groupId,targetId).run();
}
async function syncOwnedNotesToChapter(d: ReturnType<typeof db>,userId:string,sourceChapterId:string,targetChapterId:string){
  const notes=await d.prepare("SELECT * FROM scripture_meditations WHERE chapter_id=? AND user_id=? AND visibility='inherit'").bind(sourceChapterId,userId).all<any>();
  for(const n of notes.results||[]){
    const key=n.sync_key||n.id;
    if(!n.sync_key)await d.prepare("UPDATE scripture_meditations SET sync_key=? WHERE id=? AND sync_key IS NULL").bind(key,n.id).run();
    const found=await d.prepare("SELECT id FROM scripture_meditations WHERE chapter_id=? AND sync_key=?").bind(targetChapterId,key).first<any>();
    if(found)continue;
    const same=await d.prepare("SELECT id FROM scripture_meditations WHERE chapter_id=? AND user_id=? AND body=? AND visibility='inherit' ORDER BY created_at LIMIT 1").bind(targetChapterId,userId,n.body).first<any>();
    if(same){await d.prepare("UPDATE scripture_meditations SET sync_key=? WHERE id=? AND sync_key IS NULL").bind(key,same.id).run();continue}
    await d.prepare("INSERT INTO scripture_meditations(id,chapter_id,user_id,author_name,body,is_seed,is_anonymous,visibility,sync_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),targetChapterId,userId,n.author_name,n.body,n.is_seed,n.is_anonymous,n.visibility,key,n.created_at).run();
  }
}
async function syncScriptureChapter(d: ReturnType<typeof db>,userId:string,chapterId:string,groupIds:string[],friendIds:string[],syncPrivate:boolean){
  const source=await d.prepare("SELECT * FROM scripture_chapters WHERE id=?").bind(chapterId).first<any>();if(!source)return {error:"chapter_not_found"};
  if(source.created_by!==userId)return {error:"chapter_owner_required"};
  const valid=await validateScriptureTargets(d,userId,groupIds,friendIds);if(!valid)return {error:"invalid_share_targets"};
  const targets:{type:"private"|"group"|"friends";id:string;users:string[]}[]=[];
  if(syncPrivate)targets.push({type:"private",id:userId,users:[]});
  for(const id of valid.groups)targets.push({type:"group",id,users:[]});
  if(valid.friends.length)targets.push({type:"friends",id:userId,users:valid.friends});
  for(const target of targets){
    let dest:any;
    if(target.type===source.scope_type&&target.id===source.scope_id)dest=source;
    else dest=await d.prepare("SELECT * FROM scripture_chapters WHERE scope_type=? AND scope_id=? AND book_id=? AND chapter=?").bind(target.type,target.id,source.book_id,source.chapter).first<any>();
    if(!dest){
      const id=crypto.randomUUID(),now=isoNow();
      await d.prepare("INSERT INTO scripture_chapters(id,scope_type,scope_id,book_id,book_name,chapter,scripture_text,created_by,creator_name,is_anonymous,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,target.type,target.id,source.book_id,source.book_name,source.chapter,source.scripture_text,source.created_by,source.creator_name,source.is_anonymous,source.created_at,now).run();
      dest=await d.prepare("SELECT * FROM scripture_chapters WHERE id=?").bind(id).first<any>();
    }
    if(target.type==="friends"){
      for(const friendId of target.users)await d.prepare("INSERT OR IGNORE INTO scripture_chapter_access(chapter_id,user_id,created_at) VALUES(?,?,?)").bind(dest.id,friendId,isoNow()).run();
    }
    if(dest.id===source.id)continue;
    await linkScriptureChapter(d,userId,source.id,dest.id);
    await syncOwnedNotesToChapter(d,userId,source.id,dest.id);
    await syncOwnedNotesToChapter(d,userId,dest.id,source.id);
    for(const linkedId of [source.id,dest.id]){const own=await d.prepare("SELECT id,visibility FROM scripture_meditations WHERE chapter_id=? AND user_id=?").bind(linkedId,userId).all<any>();for(const n of own.results||[])await syncMeditationCopies(d,userId,linkedId,n.id,n.visibility)}
  }
  return {ok:true};
}
async function syncAllChapters(d: ReturnType<typeof db>,userId:string,groupIds:string[],friendIds:string[],syncPrivate:boolean,cursorValue:string){
  const valid=await validateScriptureTargets(d,userId,groupIds,friendIds);
  if(!valid)return {error:"invalid_share_targets"};
  if(!valid.groups.length&&!valid.friends.length&&!syncPrivate)return {error:"choose_share_targets"};
  const cursor=String(cursorValue||"").slice(0,150),limit=8;
  if(cursor){
    const checkpoint=await d.prepare("SELECT c.id FROM scripture_chapters c WHERE c.id=? AND c.created_by=? AND ((c.scope_type='private' AND c.scope_id=?) OR (c.scope_type='friends' AND c.scope_id=?) OR (c.scope_type='group' AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=c.scope_id AND gm.user_id=?))) AND (NOT EXISTS (SELECT 1 FROM scripture_chapter_sync_members m WHERE m.chapter_id=c.id) OR EXISTS (SELECT 1 FROM scripture_chapter_sync_members m JOIN scripture_chapter_sync_groups sg ON sg.id=m.sync_group_id WHERE m.chapter_id=c.id AND sg.source_chapter_id=c.id))").bind(cursor,userId,userId,userId,userId).first<any>();
    if(!checkpoint)return {error:"invalid_cursor"};
  }
  const rows=await d.prepare("SELECT c.id FROM scripture_chapters c WHERE c.created_by=? AND c.id>? AND ((c.scope_type='private' AND c.scope_id=?) OR (c.scope_type='friends' AND c.scope_id=?) OR (c.scope_type='group' AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=c.scope_id AND gm.user_id=?))) AND (NOT EXISTS (SELECT 1 FROM scripture_chapter_sync_members m WHERE m.chapter_id=c.id) OR EXISTS (SELECT 1 FROM scripture_chapter_sync_members m JOIN scripture_chapter_sync_groups sg ON sg.id=m.sync_group_id WHERE m.chapter_id=c.id AND sg.source_chapter_id=c.id)) ORDER BY c.id LIMIT ?").bind(userId,cursor,userId,userId,userId,limit).all<any>();
  const chapters=rows.results||[];
  for(const row of chapters){const result=await syncScriptureChapter(d,userId,String(row.id),valid.groups,valid.friends,syncPrivate);if(result.error)return {error:result.error,cursor};}
  return {ok:true,processed:chapters.length,cursor:chapters.length?String(chapters[chapters.length-1].id):cursor,done:chapters.length<limit};
}
async function syncMeditationCopies(d: ReturnType<typeof db>,userId:string,chapterId:string,noteId:string,visibility:string){
  const note=await d.prepare("SELECT * FROM scripture_meditations WHERE id=? AND user_id=?").bind(noteId,userId).first<any>();if(!note)return;
  const key=note.sync_key||note.id;
  if(!note.sync_key)await d.prepare("UPDATE scripture_meditations SET sync_key=? WHERE id=?").bind(key,note.id).run();
  const groups=await d.prepare("SELECT DISTINCT g.id FROM scripture_chapter_sync_groups g JOIN scripture_chapter_sync_members m ON m.sync_group_id=g.id WHERE g.owner_id=? AND m.chapter_id=?").bind(userId,chapterId).all<any>();
  const ids=new Set<string>([chapterId]);
  for(const row of groups.results||[]){const members=await d.prepare("SELECT m.chapter_id AS chapterId FROM scripture_chapter_sync_members m WHERE m.sync_group_id=?").bind(row.id).all<any>();for(const x of members.results||[])ids.add(x.chapterId)}
  if(visibility==="private"){for(const id of ids)if(id!==chapterId)await d.prepare("DELETE FROM scripture_meditations WHERE sync_key=? AND chapter_id=? AND user_id=?").bind(key,id,userId).run();return}
  for(const id of ids){if(id===chapterId)continue;const exists=await d.prepare("SELECT id FROM scripture_meditations WHERE chapter_id=? AND sync_key=?").bind(id,key).first<any>();if(exists){await d.prepare("UPDATE scripture_meditations SET author_name=?,body=?,is_seed=?,is_anonymous=?,visibility=? WHERE id=? AND user_id=?").bind(note.author_name,note.body,note.is_seed,note.is_anonymous,note.visibility,exists.id,userId).run();continue}await d.prepare("INSERT INTO scripture_meditations(id,chapter_id,user_id,author_name,body,is_seed,is_anonymous,visibility,sync_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,userId,note.author_name,note.body,note.is_seed,note.is_anonymous,note.visibility,key,note.created_at).run()}
}
export async function GET(request: Request) {
  const u=await requireUser(); if(!u)return json({error:"sign_in_required"},401);
  const url=new URL(request.url),type=url.searchParams.get("scopeType")||"private";
  if(type==="recentOwned"){
    const recent=await db().prepare("SELECT c.book_id AS bookId,c.chapter,c.scope_type AS scopeType,c.scope_id AS scopeId,c.created_at AS createdAt FROM scripture_chapters c WHERE c.created_by=? AND ((c.scope_type='private' AND c.scope_id=?) OR (c.scope_type='friends' AND c.scope_id=?) OR (c.scope_type='group' AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=c.scope_id AND gm.user_id=?))) ORDER BY c.created_at DESC,CASE c.scope_type WHEN 'private' THEN 0 WHEN 'friends' THEN 1 ELSE 2 END,c.id DESC LIMIT 1").bind(u.userId,u.userId,u.userId,u.userId).first<any>();
    return json({recent:recent||null});
  }
  if(type==="shared"&&!url.searchParams.get("scopeId")) return json({sharedBooks:await getSharedBooks(u.userId)});
  const scope=await getScope(type,url.searchParams.get("scopeId"),u.userId);
  if(!scope)return json({error:"group_not_found_or_forbidden"},403);
  const bookId=url.searchParams.get("bookId")||"",chapterNo=Number(url.searchParams.get("chapter")||0),d=db();
  let chapters;
  if(scope.type==="shared"){
    chapters=await d.prepare(`SELECT c.id,c.book_id AS bookId,c.chapter,c.created_at AS createdAt,(SELECT MAX(m.created_at) FROM scripture_meditations m WHERE m.chapter_id=c.id AND m.user_id<>? AND m.visibility='inherit') AS latestMeditationAt
      FROM scripture_chapters c JOIN scripture_chapter_access a ON a.chapter_id=c.id
      JOIN friends f ON f.user_id=c.scope_id AND f.friend_id=a.user_id
      WHERE c.scope_type='friends' AND c.scope_id=? AND a.user_id=? ORDER BY c.book_id,c.chapter`).bind(u.userId,scope.id,u.userId).all();
  } else {
    chapters=await d.prepare("SELECT c.id,c.book_id AS bookId,c.chapter,c.created_at AS createdAt,(SELECT MAX(m.created_at) FROM scripture_meditations m WHERE m.chapter_id=c.id AND m.user_id<>? AND m.visibility='inherit') AS latestMeditationAt FROM scripture_chapters c WHERE c.scope_type=? AND c.scope_id=? ORDER BY c.book_id,c.chapter").bind(u.userId,databaseScopeType(scope),scope.id).all();
  }
  const progress=await d.prepare("SELECT book_id AS bookId,chapter,read_at AS readAt FROM scripture_reading_progress WHERE user_id=? AND scope_type=? AND scope_id=?").bind(u.userId,scope.type,scope.id).all();
  let chapterRow:any=null,meditations:any[]=[],sharedWith:any[]=[];
  if(BOOKS[bookId]&&Number.isInteger(chapterNo)&&chapterNo>0&&chapterNo<=BOOKS[bookId].count){
    if(scope.type==="shared"){
      chapterRow=await d.prepare(`SELECT c.id,c.book_id AS bookId,c.book_name AS bookName,c.chapter,c.scripture_text AS scriptureText,CASE WHEN c.is_anonymous=1 THEN '익명' ELSE c.creator_name END AS creatorName,CASE WHEN c.created_by=? THEN 1 ELSE 0 END AS canSync,c.created_at AS createdAt
        FROM scripture_chapters c JOIN scripture_chapter_access a ON a.chapter_id=c.id
        JOIN friends f ON f.user_id=c.scope_id AND f.friend_id=a.user_id
        WHERE c.scope_type='friends' AND c.scope_id=? AND a.user_id=? AND c.book_id=? AND c.chapter=?`).bind(u.userId,scope.id,u.userId,bookId,chapterNo).first();
    } else {
      chapterRow=await d.prepare("SELECT id,book_id AS bookId,book_name AS bookName,chapter,scripture_text AS scriptureText,CASE WHEN is_anonymous=1 THEN '익명' ELSE creator_name END AS creatorName,CASE WHEN created_by=? THEN 1 ELSE 0 END AS canSync,created_at AS createdAt FROM scripture_chapters WHERE scope_type=? AND scope_id=? AND book_id=? AND chapter=?").bind(u.userId,databaseScopeType(scope),scope.id,bookId,chapterNo).first();
    }
    if(chapterRow){
      const rows=await d.prepare("SELECT id,CASE WHEN is_anonymous=1 THEN '익명' ELSE author_name END AS authorName,body,is_seed AS isSeed,is_anonymous AS isAnonymous,visibility,CASE WHEN user_id=? THEN 1 ELSE 0 END AS canDelete,created_at AS createdAt FROM scripture_meditations WHERE chapter_id=? AND (visibility='inherit' OR user_id=?) ORDER BY created_at,id").bind(u.userId,chapterRow.id,u.userId).all<any>();
      meditations=rows.results||[];
      if(scope.type==="friends"){
        const access=await d.prepare(`SELECT a.user_id AS userId,COALESCE(NULLIF(fa.alias,''),NULLIF(f.friend_name,''),'친구') AS name
          FROM scripture_chapter_access a LEFT JOIN friends f ON f.user_id=? AND f.friend_id=a.user_id
          LEFT JOIN friend_aliases fa ON fa.user_id=? AND fa.friend_id=a.user_id
          WHERE a.chapter_id=? ORDER BY name`).bind(u.userId,u.userId,chapterRow.id).all<any>();
        sharedWith=access.results||[];
      }
    }
  }
  if(chapterRow&&scope.type==="friends")chapterRow.sharedWith=sharedWith;
  return json({scope,chapters:chapters.results||[],progress:progress.results||[],chapter:chapterRow,meditations,sharedWith});
}

export async function POST(request: Request) {
  if(!await sameOrigin(request))return json({error:"invalid_origin"},403);
  const u=await requireUser(); if(!u)return json({error:"sign_in_required"},401);
  const data=await body(request); if(!data)return json({error:"invalid_body"},400);
  const scope=await scopeFromBody(data,u.userId); if(!scope)return json({error:"group_not_found_or_forbidden"},403);
  const action=String(data.action||""),d=db();
  if(action==="syncChapter"){
    const chapterId=String(data.chapterId||"");if(!chapterId)return json({error:"chapter_not_found"},404);
    let allowed: unknown;
    if(scope.type==="shared")allowed=await d.prepare("SELECT c.id FROM scripture_chapters c JOIN scripture_chapter_access a ON a.chapter_id=c.id WHERE c.id=? AND c.scope_type='friends' AND c.scope_id=? AND a.user_id=?").bind(chapterId,scope.id,u.userId).first();
    else allowed=await d.prepare("SELECT id FROM scripture_chapters WHERE id=? AND scope_type=? AND scope_id=?").bind(chapterId,databaseScopeType(scope),scope.id).first();
    if(!allowed)return json({error:"chapter_not_found"},404);
    const result=await syncScriptureChapter(d,u.userId,chapterId,Array.isArray(data.groupIds)?data.groupIds.map(String):[],Array.isArray(data.friendIds)?data.friendIds.map(String):[],!!data.syncPrivate);
    if(result.error)return json(result,result.error==="chapter_owner_required"?403:400);
    return json({ok:true});
  }
  if(action==="syncAllChapters"){
    const result=await syncAllChapters(d,u.userId,Array.isArray(data.groupIds)?data.groupIds.map(String):[],Array.isArray(data.friendIds)?data.friendIds.map(String):[],!!data.syncPrivate,String(data.cursor||""));
    if(result.error)return json(result,400);
    return json(result);
  }
  if(action==="createChapter"){
    if(scope.type==="shared")return json({error:"cannot_create_in_shared_book"},403);
    const bookId=String(data.bookId||""),book=BOOKS[bookId],chapter=Number(data.chapter);
    const scripture=String(data.scriptureText||"").trim(),meditation=String(data.meditation||"").trim();
    if(!book||!Number.isInteger(chapter)||chapter<1||chapter>book.count||scripture.length<20||scripture.length>30000||meditation.length<2||meditation.length>3000)return json({error:"chapter_and_meditation_required"},400);
    let recipients:string[]=[];
    if(scope.type==="friends"){
      const raw=Array.isArray(data.shareUserIds)?data.shareUserIds:[];
      recipients=[...new Set(raw.map((x:any)=>String(x).slice(0,150)).filter(Boolean))];
      if(!recipients.length||recipients.length>30)return json({error:"choose_friends"},400);
      const placeholders=recipients.map(()=>"?").join(",");
      const friends=await d.prepare(`SELECT friend_id FROM friends WHERE user_id=? AND friend_id IN (${placeholders})`).bind(u.userId,...recipients).all<any>();
      if((friends.results||[]).length!==recipients.length)return json({error:"select_friends_only"},400);
    }
    const targetGroupIds=Array.isArray(data.targetGroupIds)?data.targetGroupIds.map(String):[],targetFriendIds=[...new Set([...(Array.isArray(data.targetFriendIds)?data.targetFriendIds.map(String):[]),...recipients])],syncPrivate=!!data.syncPrivate;
    const validTargets=await validateScriptureTargets(d,u.userId,targetGroupIds,targetFriendIds);if(!validTargets)return json({error:"invalid_share_targets"},400);
    const chapterId=crypto.randomUUID(),noteId=crypto.randomUUID(),now=isoNow();
    const chapterAnonymous=!!data.chapterAnonymous,anonymous=!!(data.meditationAnonymous??data.anonymous),visibility=data.visibility==="private"?"private":"inherit",author=await prayerDisplayName(u.userId,String(u.displayName||"말씀나무 사용자"));
    const statements=[
      d.prepare("INSERT INTO scripture_chapters (id,scope_type,scope_id,book_id,book_name,chapter,scripture_text,created_by,creator_name,is_anonymous,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(chapterId,databaseScopeType(scope),scope.id,bookId,book.name,chapter,scripture,u.userId,author,chapterAnonymous?1:0,now,now),
      d.prepare("INSERT INTO scripture_meditations (id,chapter_id,user_id,author_name,body,is_seed,is_anonymous,visibility,created_at) VALUES (?,?,?,?,?,1,?,?,?)").bind(noteId,chapterId,u.userId,author,meditation,anonymous?1:0,visibility,now),
      ...recipients.map(userId=>d.prepare("INSERT INTO scripture_chapter_access (chapter_id,user_id,created_at) VALUES (?,?,?)").bind(chapterId,userId,now))
    ];
    try{await d.batch(statements)}catch(error){
      if(String(error).includes("UNIQUE constraint failed")){
        const existing=await d.prepare("SELECT id FROM scripture_chapters WHERE scope_type=? AND scope_id=? AND book_id=? AND chapter=?").bind(databaseScopeType(scope),scope.id,bookId,chapter).first<any>();
        if(existing){const synced=await syncScriptureChapter(d,u.userId,existing.id,validTargets.groups,validTargets.friends,syncPrivate);if(synced.error)return json(synced,400);return json({error:"chapter_already_created",chapterId:existing.id},409)}
      }
      throw error;
    }
    const synced=await syncScriptureChapter(d,u.userId,chapterId,validTargets.groups,validTargets.friends,syncPrivate);if(synced.error)return json(synced,400);
    return json({ok:true,chapterId});
  }
  if(action==="meditation"){
    const chapterId=String(data.chapterId||""),meditation=String(data.meditation||"").trim();
    if(!chapterId||meditation.length<2||meditation.length>3000)return json({error:"invalid_meditation"},400);
    let chapter:any;
    if(scope.type==="shared"){
      chapter=await d.prepare(`SELECT c.id FROM scripture_chapters c
        JOIN scripture_chapter_access a ON a.chapter_id=c.id
        JOIN friends f ON f.user_id=c.scope_id AND f.friend_id=a.user_id
        WHERE c.id=? AND c.scope_type='friends' AND c.scope_id=? AND a.user_id=?`).bind(chapterId,scope.id,u.userId).first();
    } else {
      chapter=await d.prepare("SELECT id FROM scripture_chapters WHERE id=? AND scope_type=? AND scope_id=?").bind(chapterId,databaseScopeType(scope),scope.id).first();
    }
    if(!chapter)return json({error:"chapter_not_found"},404);
    const id=crypto.randomUUID(),now=isoNow(),anonymous=!!data.anonymous,visibility=data.visibility==="private"?"private":"inherit",author=await prayerDisplayName(u.userId,String(u.displayName||"말씀나무 사용자"));
    await d.prepare("INSERT INTO scripture_meditations (id,chapter_id,user_id,author_name,body,is_seed,is_anonymous,visibility,sync_key,created_at) VALUES (?,?,?,?,?,0,?,?,?,?)").bind(id,chapterId,u.userId,author,meditation,anonymous?1:0,visibility,crypto.randomUUID(),now).run();
    await syncMeditationCopies(d,u.userId,chapterId,id,visibility);
    return json({ok:true,id});
  }
  if(action==="editMeditation"){
    const id=String(data.id||""),text=String(data.body||"").trim(),visibility=data.visibility==="private"?"private":"inherit";
    if(!id||text.length<2||text.length>3000)return json({error:"invalid_meditation"},400);
    const note=await d.prepare("SELECT user_id AS userId FROM scripture_meditations WHERE id=?").bind(id).first<any>();
    if(!note)return json({error:"not_found"},404);if(note.userId!==u.userId)return json({error:"forbidden"},403);
    const author=await prayerDisplayName(u.userId,String(u.displayName||"말씀나무 사용자"));
    await d.prepare("UPDATE scripture_meditations SET body=?,author_name=?,is_anonymous=?,visibility=? WHERE id=? AND user_id=?").bind(text,author,data.anonymous?1:0,visibility,id,u.userId).run();
    const row=await d.prepare("SELECT chapter_id AS chapterId FROM scripture_meditations WHERE id=?").bind(id).first<any>();await syncMeditationCopies(d,u.userId,row?.chapterId||"",id,visibility)
    return json({ok:true});
  }
  if(action==="progress"){
    if(scope.type==="shared"&&!await canReadSharedBook(scope.id,u.userId))return json({error:"forbidden"},403);
    const bookId=String(data.bookId||""),book=BOOKS[bookId],chapter=Number(data.chapter),read=!!data.read;
    if(!book||!Number.isInteger(chapter)||chapter<1||chapter>book.count)return json({error:"invalid_progress"},400);
    if(read)await d.prepare("INSERT OR IGNORE INTO scripture_reading_progress (user_id,scope_type,scope_id,book_id,chapter,read_at) VALUES (?,?,?,?,?,?)").bind(u.userId,scope.type,scope.id,bookId,chapter,isoNow()).run();
    else await d.prepare("DELETE FROM scripture_reading_progress WHERE user_id=? AND scope_type=? AND scope_id=? AND book_id=? AND chapter=?").bind(u.userId,scope.type,scope.id,bookId,chapter).run();
    return json({ok:true});
  }
  return json({error:"unknown_action"},400);
}

export async function DELETE(request: Request) {
  if(!await sameOrigin(request))return json({error:"invalid_origin"},403);
  const u=await requireUser(); if(!u)return json({error:"sign_in_required"},401);
  const data=await body(request),id=String(data?.id||""); if(!id)return json({error:"invalid_id"},400);
  const d=db(),note=await d.prepare("SELECT sync_key AS syncKey FROM scripture_meditations WHERE id=? AND user_id=?").bind(id,u.userId).first<any>();if(!note)return json({error:"not_found"},404);
  const result=note.syncKey?await d.prepare("DELETE FROM scripture_meditations WHERE sync_key=? AND user_id=?").bind(note.syncKey,u.userId).run():await d.prepare("DELETE FROM scripture_meditations WHERE id=? AND user_id=?").bind(id,u.userId).run();
  return result.meta.changes?json({ok:true}):json({error:"not_found"},404);
}
