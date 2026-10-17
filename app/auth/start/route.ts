import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { cookieOptions, safeReturnPath, signPayload } from "@/lib/google-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("oai-authenticated-user-id")) return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("return_to")), url));
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) {
    if (url.hostname.endsWith(".chatgpt.site") || ["localhost", "127.0.0.1"].includes(url.hostname)) {
      const nativeLogin = new URL("/signin-with-chatgpt", url);
      nativeLogin.searchParams.set("return_to", safeReturnPath(url.searchParams.get("return_to")));
      return NextResponse.redirect(nativeLogin);
    }
    return new Response("Google 로그인 설정이 아직 완료되지 않았습니다. 호스팅 환경에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET을 등록해 주세요.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const state = [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  const signedState = await signPayload({ state, returnTo, exp: Date.now() + 10 * 60 * 1000 });
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: new URL("/auth/callback", url.origin).toString(), response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
  const response = NextResponse.redirect(google);
  response.headers.append("Set-Cookie", `prayer_tree_oauth=${signedState}; ${cookieOptions(request, 600)}`);
  return response;
}
