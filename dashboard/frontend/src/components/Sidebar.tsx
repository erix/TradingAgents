import { NavLink } from "react-router-dom";
import { LayoutDashboard, BarChart3, Activity } from "lucide-react";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/history", label: "History", icon: BarChart3 },
  { to: "/live", label: "Live Status", icon: Activity },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 5 5-10"/></svg>
        TradingAgents
      </div>
      <nav>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div style={{ marginTop: "auto", padding: "20px", fontSize: "11px", color: "#64748b" }}>
        v1.0.0 · erix/TradingAgents
      </div>
    </aside>
  );
}
