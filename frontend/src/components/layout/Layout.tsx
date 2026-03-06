import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { VideoBackground } from "./VideoBackground";
import { ErrorBoundary } from "../common/ErrorBoundary";

export function Layout() {
  return (
    <>
      <VideoBackground />
      <div className="app-layout">
        <Sidebar />
        <div className="app-main">
          <Header />
          <main className="app-content">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
