import { useRef, useEffect, useCallback, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useLastDataDate } from "../../hooks/useLastDataDate";
import { formatDate } from "../../utils/formatters";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/rrg": "Relative Rotation (RRG)",
  "/rrg/sectors": "Sector Rotation (RRG)",
  "/rrg/cross-asset": "Cross-Asset Rotation (RRG)",
  "/prices": "Price Explorer",
  "/capital-flow": "Capital Flow Structure",
  "/regime": "Market Regime",
  "/volatility": "VIX Structure",
  "/compare": "Asset Comparison",
};

const topTabs = [
  { to: "/", label: "OVERVIEW" },
  { to: "/compare", label: "ASSET COMPARISON" },
];

const topTabRoutes = new Set(["/", "/compare"]);

/**
 * Liquid-droplet tab indicator.
 *
 * Animation phases when switching tabs:
 *   1. Stretch  — the blob expands to cover from its origin to the target tab
 *   2. Contract — the trailing edge catches up so the blob shrinks onto the target
 *   3. Wobble   — a slight overshoot squish on arrival
 */
function TabBar() {
  const location = useLocation();
  const navRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const prevRect = useRef<{ left: number; width: number } | null>(null);
  const animating = useRef(false);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return null;
    const active = nav.querySelector<HTMLElement>(".header-tab--active");
    if (!active) return null;
    const navRect = nav.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    return { left: tabRect.left - navRect.left, width: tabRect.width };
  }, []);

  /* Place blob without animation (first render / resize) */
  const place = useCallback(() => {
    const pos = measure();
    const blob = blobRef.current;
    if (!pos || !blob) return;
    blob.style.transition = "none";
    blob.style.left = `${pos.left}px`;
    blob.style.width = `${pos.width}px`;
    blob.style.borderRadius = "9px";
    prevRect.current = pos;
    if (!ready) setReady(true);
  }, [measure, ready]);

  /* Liquid animation: stretch → contract → wobble */
  const animateDrop = useCallback(() => {
    const blob = blobRef.current;
    const from = prevRect.current;
    const to = measure();
    if (!blob || !from || !to) { place(); return; }
    if (from.left === to.left && from.width === to.width) return;
    if (animating.current) { place(); return; }
    animating.current = true;

    const goingRight = to.left > from.left;

    // Phase 1 — stretch: leading edge jumps to target, trailing edge stays
    const stretchLeft = goingRight ? from.left : to.left;
    const stretchRight = goingRight
      ? to.left + to.width
      : from.left + from.width;
    const stretchWidth = stretchRight - stretchLeft;

    // Squish border-radius in the direction of travel
    const stretchRadius = goingRight
      ? "9px 22px 22px 9px"
      : "22px 9px 9px 22px";

    blob.style.transition = "none";
    blob.style.left = `${from.left}px`;
    blob.style.width = `${from.width}px`;

    requestAnimationFrame(() => {
      // Stretch
      blob.style.transition =
        "left 0.22s cubic-bezier(0.4,0,0.2,1)," +
        "width 0.22s cubic-bezier(0.4,0,0.2,1)," +
        "border-radius 0.22s ease";
      blob.style.left = `${stretchLeft}px`;
      blob.style.width = `${stretchWidth}px`;
      blob.style.borderRadius = stretchRadius;

      // Phase 2 — contract: trailing edge catches up
      const onStretchEnd = () => {
        blob.removeEventListener("transitionend", onStretchEnd);

        // Slight overshoot (wobble): target shrinks 6px past final, then settles
        const overshoot = goingRight ? 6 : -6;
        const wobbleLeft = to.left + overshoot;
        const wobbleWidth = to.width - Math.abs(overshoot);

        blob.style.transition =
          "left 0.22s cubic-bezier(0.4,0,0.2,1)," +
          "width 0.22s cubic-bezier(0.4,0,0.2,1)," +
          "border-radius 0.18s ease";
        blob.style.left = `${wobbleLeft}px`;
        blob.style.width = `${wobbleWidth}px`;
        blob.style.borderRadius = "9px";

        // Phase 3 — settle
        const onContractEnd = () => {
          blob.removeEventListener("transitionend", onContractEnd);
          blob.style.transition =
            "left 0.15s cubic-bezier(0.34,1.4,0.64,1)," +
            "width 0.15s cubic-bezier(0.34,1.4,0.64,1)";
          blob.style.left = `${to.left}px`;
          blob.style.width = `${to.width}px`;

          const onSettle = () => {
            blob.removeEventListener("transitionend", onSettle);
            prevRect.current = to;
            animating.current = false;
          };
          blob.addEventListener("transitionend", onSettle, { once: true });
        };
        blob.addEventListener("transitionend", onContractEnd, { once: true });
      };
      blob.addEventListener("transitionend", onStretchEnd, { once: true });
    });
  }, [measure, place]);

  // First mount: place immediately
  useEffect(() => {
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route change: animate
  useEffect(() => {
    if (!ready) return;
    animateDrop();
  }, [location.pathname, ready, animateDrop]);

  useEffect(() => {
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  return (
    <nav className="header-top-tabs" ref={navRef}>
      <div
        className={`header-tab-blob ${ready ? "header-tab-blob--ready" : ""}`}
        ref={blobRef}
      />
      {topTabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            `header-tab ${isActive ? "header-tab--active" : ""}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const location = useLocation();
  const showTopTabs = topTabRoutes.has(location.pathname);
  const title = pageTitles[location.pathname] ?? "Rotation Dashboard";
  const lastDate = useLastDataDate();

  return (
    <header className="header">
      <button className="header-menu-btn" onClick={onMenuClick} aria-label="Menu">
        <Menu size={20} />
      </button>

      {showTopTabs ? <TabBar /> : <h1 className="header-title">{title}</h1>}

      <div className="header-right">
        {lastDate && (
          <span className="header-data-date">Data as of {formatDate(lastDate)}</span>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
