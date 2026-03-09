import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Radar,
  Globe,
  LineChart,
  BarChart3,
  Gauge,
} from "lucide-react";

const navGroups = [
  {
    label: null,
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Rotation",
    items: [
      { to: "/rrg/sectors", label: "Sectors", icon: Radar },
      { to: "/rrg/cross-asset", label: "Cross-Asset", icon: Globe },
    ],
  },
  {
    label: "Flow",
    items: [
      { to: "/capital-flow", label: "Capital Flow Structure", icon: BarChart3 },
    ],
  },
  {
    label: "Momentum",
    items: [
      { to: "/regime", label: "Market Regime", icon: Gauge },
    ],
  },
  {
    label: "Data",
    items: [{ to: "/prices", label: "Price Explorer", icon: LineChart }],
  },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Radar size={24} />
        <span>Rotation Dashboard</span>
      </div>
      <nav className="sidebar-nav">
        {navGroups.map((group, gi) => (
          <div key={gi} className="sidebar-group">
            {group.label && (
              <span className="sidebar-section-label">{group.label}</span>
            )}
            {group.items.map((item) => (
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
          </div>
        ))}
      </nav>
    </aside>
  );
}
