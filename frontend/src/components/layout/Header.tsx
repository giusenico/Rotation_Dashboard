import { useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/rrg": "Relative Rotation (RRG)",
  "/rrg/sectors": "Sector Rotation (RRG)",
  "/rrg/cross-asset": "Cross-Asset Rotation (RRG)",
  "/prices": "Price Explorer",
  "/capital-flow": "Capital Flow Structure",
  "/regime": "Market Regime",
};

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "Rotation Dashboard";

  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>
      <ThemeToggle />
    </header>
  );
}
