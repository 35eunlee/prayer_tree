"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const returnTo = typeof window === "undefined" ? "/" : new URLSearchParams(window.location.search).get("return_to") || "/";
  const googleUrl = `/auth/start?return_to=${encodeURIComponent(returnTo)}`;

  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, return_to: returnTo }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "로그인 링크를 보내지 못했습니다.");
      setMessage(result.message || "이메일을 확인해 주세요.");
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "로그인 링크를 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f8f7ef", color: "#315449", fontFamily: "'Gowun Batang', serif" }}>
      <section style={{ width: "min(100%, 440px)", padding: "36px 30px", borderRadius: 24, background: "#fffefa", boxShadow: "0 14px 45px #31544918" }}>
        <a href="/" style={{ color: "#839087", textDecoration: "none", fontSize: 14 }}>← 기도나무로</a>
        <h1 style={{ margin: "18px 0 8px", fontSize: 30 }}>기도나무 로그인</h1>
        <p style={{ marginTop: 0, lineHeight: 1.7, color: "#68776f" }}>기도 기록과 그룹을 다른 기기에서도 이어서 확인하세요.</p>
        <a href={googleUrl} style={{ display: "block", marginTop: 24, padding: 14, border: "1px solid #d9e1d8", borderRadius: 12, textAlign: "center", color: "#315449", textDecoration: "none", fontWeight: 700 }}>Google로 계속하기</a>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0", color: "#839087", fontSize: 14 }}><span style={{ height: 1, flex: 1, background: "#e4e5d9" }} />또는 이메일로 로그인<span style={{ height: 1, flex: 1, background: "#e4e5d9" }} /></div>
        <form onSubmit={requestLink}>
          <label htmlFor="email" style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>이메일 주소</label>
          <input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" style={{ width: "100%", padding: "13px 14px", border: "1px solid #d9e1d8", borderRadius: 12, background: "white", boxSizing: "border-box" }} />
          <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 12, padding: 14, border: 0, borderRadius: 12, background: busy ? "#9db5ab" : "#4e8171", color: "white", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>{busy ? "보내는 중…" : "로그인 링크 받기"}</button>
        </form>
        <p aria-live="polite" role={error ? "alert" : "status"} style={{ minHeight: 24, marginBottom: 0, lineHeight: 1.6, color: error ? "#a94747" : "#315449" }}>{message}</p>
        <p style={{ marginBottom: 0, color: "#839087", fontSize: 13, lineHeight: 1.6 }}>비밀번호 없이 이메일로 받은 일회용 링크를 사용합니다. 링크는 10분 동안 유효합니다.</p>
      </section>
    </main>
  );
}
