import "./globals.css";
export const metadata = { title: "Lumen · AI photo editor" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="font-sans text-[13px] antialiased">{children}</body></html>);
}
