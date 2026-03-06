import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { SectorRRGPage } from "./pages/SectorRRGPage";
import { CrossAssetRRGPage } from "./pages/CrossAssetRRGPage";
import { PriceExplorerPage } from "./pages/PriceExplorerPage";
import { RankingsPage } from "./pages/RankingsPage";
import { OBVStructurePage } from "./pages/OBVStructurePage";

function NotFoundPage() {
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <h1 style={{ fontSize: 48, marginBottom: 8 }}>404</h1>
      <p style={{ marginBottom: 24, color: "var(--text-muted)" }}>Page not found</p>
      <Link to="/" className="view-full-link">Back to Dashboard</Link>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "rrg/sectors", element: <SectorRRGPage /> },
      { path: "rrg/cross-asset", element: <CrossAssetRRGPage /> },
      { path: "prices", element: <PriceExplorerPage /> },
      { path: "rankings", element: <RankingsPage /> },
      { path: "obv", element: <OBVStructurePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
