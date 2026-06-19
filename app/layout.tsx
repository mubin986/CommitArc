import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CommitArc — GitHub Commit History Analyzer",
  description:
    "Analyze GitHub commit history over a date range or up to a tag, with an AI-generated report.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Set the theme class before paint to avoid a flash of the wrong theme.
  const themeInit = `(function(){try{var t=localStorage.getItem('commitarc-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
