import type { Metadata } from "next";
export const metadata: Metadata = { title: "기도나무 · 함께 자라는 기도", description: "기도를 기록하고, 함께 기도하며 응답을 기다리는 곳" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
