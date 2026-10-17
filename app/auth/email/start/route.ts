import { env } from "cloudflare:workers";
import { safeReturnPath } from "@/lib/google-session";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "요청을 확인할 수 없습니다." }, 403);
  if (!env.DB || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return json({ error: "로그인 설정이 완료되지 않았습니다." }, 503);
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ error: "이메일 발송 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요." }, 503);

  let body: { email?: unknown; return_to?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: "이메일 주소를 확인해 주세요." }, 400); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !emailPattern.test(email)) return json({ error: "올바른 이메일 주소를 입력해 주세요." }, 400);

  const now = Date.now();
  await env.DB.prepare("DELETE FROM email_magic_links WHERE expires_at <= ?").bind(now).run();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM email_magic_links WHERE email = ? AND created_at > ?").bind(email, now - 10 * 60 * 1000).first<{ count: number }>();
  const lastMinute = await env.DB.prepare("SELECT COUNT(*) AS count FROM email_magic_links WHERE email = ? AND created_at > ?").bind(email, now - 60 * 1000).first<{ count: number }>();
  if ((recent?.count || 0) >= 3 || (lastMinute?.count || 0) >= 1) {
    return json({ ok: true, message: "요청이 가능하다면 로그인 링크를 이메일로 보냈습니다. 받은 편지함을 확인해 주세요." });
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);
  const returnTo = safeReturnPath(typeof body.return_to === "string" ? body.return_to : null);
  const expiresAt = now + 10 * 60 * 1000;
  await env.DB.prepare("INSERT INTO email_magic_links (token_hash, email, return_to, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)").bind(tokenHash, email, returnTo, expiresAt, now).run();

  const link = new URL("/auth/email/verify", request.url);
  link.searchParams.set("token", token);
  let sent: Response;
  try {
    sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject: "기도나무 로그인 링크", text: `아래 링크를 열어 기도나무에 로그인해 주세요. 이 링크는 10분 동안 유효하며 한 번만 사용할 수 있습니다.\n\n${link}\n\n직접 요청하지 않았다면 이 이메일을 무시해 주세요.`, html: `<p>아래 버튼을 눌러 기도나무에 로그인해 주세요.</p><p><a href="${link}">기도나무 로그인</a></p><p>이 링크는 10분 동안 유효하며 한 번만 사용할 수 있습니다. 직접 요청하지 않았다면 이 이메일을 무시해 주세요.</p>` }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    await env.DB.prepare("DELETE FROM email_magic_links WHERE token_hash = ? AND consumed_at IS NULL").bind(tokenHash).run();
    return json({ error: "이메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." }, 502);
  }
  if (!sent.ok) {
    await env.DB.prepare("DELETE FROM email_magic_links WHERE token_hash = ? AND consumed_at IS NULL").bind(tokenHash).run();
    return json({ error: "이메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." }, 502);
  }
  return json({ ok: true, message: "요청이 가능하다면 로그인 링크를 이메일로 보냈습니다. 받은 편지함을 확인해 주세요." });
}
