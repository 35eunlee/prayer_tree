import { headers } from "next/headers";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export function db() { if (!env.DB) throw new Error("D1 database binding DB is missing"); return env.DB; }
export async function user() { return getChatGPTUser(); }
export async function requireUser() { const u=await user(); if(!u) return null; return u; }
export function json(data: unknown, status=200) { return Response.json(data,{status,headers:{"Cache-Control":"no-store"}}); }
export async function body(request: Request) { try { return await request.json() as Record<string, any>; } catch { return null; } }
export async function sameOrigin(request: Request) { const origin=request.headers.get("origin"); return !origin || origin===new URL(request.url).origin; }
export function todaySeoul() { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
export function isoNow() { return new Date().toISOString(); }
export function bytesToHex(bytes: Uint8Array) { return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join(""); }
export async function pinHash(pin: string, saltHex: string) { const salt=Uint8Array.from(saltHex.match(/.{2}/g)??[],b=>parseInt(b,16)); const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]); const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256); return bytesToHex(new Uint8Array(bits)); }
export async function isGroupMember(groupId:string,userId:string) { return !!(await db().prepare("SELECT 1 AS ok FROM group_members WHERE group_id=? AND user_id=?").bind(groupId,userId).first()); }
