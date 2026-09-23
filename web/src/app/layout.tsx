import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "course-rush",
  description: "수강신청 동시성 — 다섯 구현을 같은 부하로 비교한다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
