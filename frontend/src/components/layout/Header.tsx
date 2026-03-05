import { useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/rrg/sectors": "Sector Rotation (RRG)",
  "/rrg/cross-asset": "Cross-Asset Rotation (RRG)",
  "/prices": "Price Explorer",
  "/rankings": "Rankings",
  "/obv": "OBV Structure",
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
