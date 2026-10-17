import { NextResponse } from "next/server";
import { cookieOptions, SESSION_COOKIE } from "@/lib/google-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("oai-authenticated-user-id")) return NextResponse.redirect(new URL("/signout-with-chatgpt?return_to=%2F", url));
  const response = NextResponse.redirect(new URL("/", url));
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieOptions(request, 0)}`);
  response.headers.append("Set-Cookie", `prayer_tree_oauth=; ${cookieOptions(request, 0)}`);
  return response;
}
