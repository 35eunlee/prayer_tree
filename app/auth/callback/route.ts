import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { cookieOptions, getCookie, safeReturnPath, SESSION_COOKIE, signPayload, verifyPayload } from "@/lib/google-session";

type OAuthState = { state: string; returnTo: string; exp: number };
type GoogleUser = { sub: string; email: string; email_verified: boolean; name?: string };

export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const signedState = getCookie(request, "prayer_tree_oauth");
  const saved = signedState ? await verifyPayload<OAuthState>(signedState) : null;
  if (!code || !state || !saved || saved.state !== state || saved.exp < Date.now()) return new Response("로그인 요청이 만료되었거나 확인되지 않았어요. 다시 로그인해 주세요.", { status: 400 });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) return new Response("Google 로그인 설정이 완료되지 않았습니다.", { status: 503 });

  const redirectUri = new URL("/auth/callback", url.origin).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  if (!tokenResponse.ok) return new Response("Google 로그인 토큰을 확인하지 못했습니다. 다시 시도해 주세요.", { status: 502 });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return new Response("Google 계정 정보를 확인하지 못했습니다.", { status: 502 });
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!profileResponse.ok) return new Response("Google 계정 정보를 가져오지 못했습니다.", { status: 502 });
  const profile = await profileResponse.json() as GoogleUser;
  if (!profile.sub || !profile.email || !profile.email_verified) return new Response("인증된 Google 이메일 계정만 사용할 수 있습니다.", { status: 403 });

  const session = await signPayload({ userId: `google:${profile.sub}`, email: profile.email, fullName: profile.name || profile.email, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  const response = NextResponse.redirect(new URL(safeReturnPath(saved.returnTo), url));
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${session}; ${cookieOptions(request, 30 * 24 * 60 * 60)}`);
  response.headers.append("Set-Cookie", `prayer_tree_oauth=; ${cookieOptions(request, 0)}`);
  return response;
}
