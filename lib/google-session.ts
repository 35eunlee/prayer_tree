import { env } from "cloudflare:workers";

export type GoogleSession = { userId: string; email: string; fullName: string; exp: number };
export const SESSION_COOKIE = "prayer_tree_session";
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function hmacKey() {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signPayload(value: unknown) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}
export async function verifyPayload<T>(token: string): Promise<T | null> {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(), fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as T;
  } catch { return null; }
}
export function cookieOptions(request: Request, maxAge: number) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://prayer-tree.local");
    return url.origin === "https://prayer-tree.local" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch { return "/"; }
}
export function getCookie(request: Request, name: string) {
  for (const item of (request.headers.get("cookie") || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator >= 0 && item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return null;
}
