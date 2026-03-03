import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Radar,
  Globe,
  LineChart,
  Trophy,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rrg/sectors", label: "Sector RRG", icon: Radar },
  { to: "/rrg/cross-asset", label: "Cross-Asset RRG", icon: Globe },
  { to: "/prices", label: "Price Explorer", icon: LineChart },
  { to: "/rankings", label: "Rankings", icon: Trophy },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Radar size={24} />
        <span>Rotation Dashboard</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "sidebar-link--active" : ""}`
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
