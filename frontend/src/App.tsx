import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { CompareProvider } from "./hooks/useCompare";
import { DashboardPage } from "./pages/DashboardPage";
import { RRGPage } from "./pages/RRGPage";
import { PriceExplorerPage } from "./pages/PriceExplorerPage";
import { FlowStructurePage } from "./pages/FlowStructurePage";
import { MarketRegimePage } from "./pages/MarketRegimePage";

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
      { path: "rrg", element: <RRGPage /> },
      { path: "rrg/sectors", element: <RRGPage /> },
      { path: "rrg/cross-asset", element: <RRGPage /> },
      { path: "prices", element: <PriceExplorerPage /> },
{ path: "obv", element: <FlowStructurePage /> },
      { path: "regime", element: <MarketRegimePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return (
    <CompareProvider>
      <RouterProvider router={router} />
    </CompareProvider>
  );
}
