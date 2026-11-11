"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import AiStatus from "./AiStatus";
import ConnectAgents from "./ConnectAgents";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Home", icon: "home" }, { href: "/projects", label: "Projects", icon: "folder" }, { href: "/library", label: "Style library", icon: "library" },
  { href: "/presets", label: "Presets", icon: "sliders" }, { href: "/capabilities", label: "Capabilities", icon: "grid" }, { href: "/settings", label: "Settings", icon: "gear" },
];
/** App frame for every page except the editor: left sidebar + content. */
export default function Shell({ children, onNew }: { children: React.ReactNode; onNew?: () => void }) {
  const path = usePathname(); const [connect, setConnect] = useState(false);
  const isOn = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <div className="flex h-screen">
      <aside className="w-[220px] shrink-0 border-r border-line bg-panel flex flex-col">
        <Link href="/" className="flex items-center gap-2.5 px-4 h-14">
          <span className="grid h-6 w-6 place-items-center rounded bg-acc text-[13px] font-bold text-[#06121f]">L</span><span className="text-[15px] font-semibold tracking-tight">Lumen</span>
        </Link>
        {onNew && <div className="px-3 pb-3"><button data-testid="new-edit" className="btn btn-primary w-full py-2" onClick={onNew}><Icon name="plus" size={14} />New edit</button></div>}
        <nav className="px-2 flex-1" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`} className={`flex items-center gap-3 rounded px-3 py-2 text-[13px] ${isOn(n.href) ? "bg-panel2 text-ink" : "text-mute hover:bg-panel2/60 hover:text-ink"}`}><Icon name={n.icon} />{n.label}</Link>)}
        </nav>
        <div className="p-3 border-t border-line space-y-2"><button data-testid="open-connect" onClick={() => setConnect(true)} className="btn w-full py-1.5 text-[12px]"><Icon name="plus" size={12} />Connect agent</button><AiStatus /><p className="text-[10px] leading-snug text-mute">Photos stay in this browser. No account, no cloud sync yet.</p></div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      <ConnectAgents open={connect} onClose={() => setConnect(false)} />
    </div>
  );
}
