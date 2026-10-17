import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { cookieOptions, safeReturnPath, SESSION_COOKIE, signPayload } from "@/lib/google-session";

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function page(token: string, status = 200) {
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>기도나무 로그인</title><body style="margin:0;background:#f8f7ef;color:#315449;font:17px sans-serif;display:grid;min-height:100vh;place-items:center"><main style="max-width:420px;margin:24px;padding:32px;background:#fffefa;border-radius:20px;text-align:center"><h1>기도나무 로그인</h1><p>이메일 주소를 확인했어요. 아래 버튼을 누르면 로그인됩니다.</p><form method="post"><input type="hidden" name="token" value="${token}"><button style="padding:14px 24px;border:0;border-radius:12px;background:#4e8171;color:white;font-size:16px">로그인하고 기도나무 열기</button></form><p style="color:#839087;font-size:14px">링크는 한 번만 사용할 수 있으며 10분 후 만료돼요.</p></main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("로그인 링크가 올바르지 않거나 만료되었습니다. 다시 요청해 주세요.", { status: 400, headers: { "Cache-Control": "no-store" } });
  return page(token);
}

export async function POST(request: Request) {
  if (!env.DB || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return new Response("로그인 설정이 완료되지 않았습니다.", { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("요청을 확인할 수 없습니다.", { status: 403 });
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return new Response("로그인 링크가 올바르지 않거나 만료되었습니다. 다시 요청해 주세요.", { status: 400 });
  const now = Date.now();
  const tokenHash = await hashToken(token);
  const challenge = await env.DB.prepare("SELECT email, return_to FROM email_magic_links WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?").bind(tokenHash, now).first<{ email: string; return_to: string }>();
  if (!challenge) return new Response("로그인 링크가 이미 사용되었거나 만료되었습니다. 다시 요청해 주세요.", { status: 400, headers: { "Cache-Control": "no-store" } });

  const consume = await env.DB.prepare("UPDATE email_magic_links SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?").bind(now, tokenHash, now).run();
  if (!consume.meta?.changes) return new Response("로그인 링크가 이미 사용되었거나 만료되었습니다. 다시 요청해 주세요.", { status: 400, headers: { "Cache-Control": "no-store" } });

  const email = challenge.email.toLowerCase();
  const proposedUserId = `email:${email}`;
  await env.DB.prepare("INSERT INTO email_identities (email, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING").bind(email, proposedUserId, now).run();
  const identity = await env.DB.prepare("SELECT user_id FROM email_identities WHERE email = ?").bind(email).first<{ user_id: string }>();
  if (!identity) return new Response("계정 정보를 저장하지 못했습니다. 다시 시도해 주세요.", { status: 503 });
  const session = await signPayload({ userId: identity.user_id, email, fullName: email, exp: now + 30 * 24 * 60 * 60 * 1000 });
  const response = NextResponse.redirect(new URL(safeReturnPath(challenge.return_to), request.url), 303);
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${session}; ${cookieOptions(request, 30 * 24 * 60 * 60)}`);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
