import { useState, useCallback, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { VideoBackground } from "./VideoBackground";
import { ErrorBoundary } from "../common/ErrorBoundary";

/** Routes that live in the top-tab strip (Overview ↔ Compare). */
const TAB_INDEX: Record<string, number> = { "/": 0, "/compare": 1 };

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggle = useCallback(() => setSidebarOpen((v) => !v), []);
  const close = useCallback(() => setSidebarOpen(false), []);

  const location = useLocation();
  const prevPath = useRef(location.pathname);

  // Determine slide direction between top-tab pages
  let direction = "";
  const curIdx = TAB_INDEX[location.pathname];
  const prevIdx = TAB_INDEX[prevPath.current];
  if (curIdx !== undefined && prevIdx !== undefined && curIdx !== prevIdx) {
    direction = curIdx > prevIdx ? "slide-left" : "slide-right";
  }
  prevPath.current = location.pathname;

  return (
    <>
      <VideoBackground />
      <div className="app-layout">
        <Sidebar open={sidebarOpen} onClose={close} />
        {sidebarOpen && <div className="sidebar-backdrop" onClick={close} />}
        <div className="app-main">
          <Header onMenuClick={toggle} />
          <main className="app-content">
            <ErrorBoundary>
              <div
                key={location.pathname}
                className={`page-transition ${direction}`}
              >
                <Outlet />
              </div>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
