import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

const Providers = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
});
const NavBar = dynamic(() => import("@/components/NavBar").then((m) => m.NavBar), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Sovereign Intelligence Bonds",
  description: "Securitize AI Agent revenue streams through ERC-3475 bonds. Agent Wall Street.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <NavBar />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
