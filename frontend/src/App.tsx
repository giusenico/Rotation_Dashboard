import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { Layout } from "./components/layout/Layout";
import { CompareProvider } from "./hooks/useCompare";
import { DashboardPage } from "./pages/DashboardPage";

const RRGPage = lazy(() => import("./pages/RRGPage").then(m => ({ default: m.RRGPage })));
const PriceExplorerPage = lazy(() => import("./pages/PriceExplorerPage").then(m => ({ default: m.PriceExplorerPage })));
const FlowStructurePage = lazy(() => import("./pages/FlowStructurePage").then(m => ({ default: m.FlowStructurePage })));
const MarketRegimePage = lazy(() => import("./pages/MarketRegimePage").then(m => ({ default: m.MarketRegimePage })));
const VolatilityPage = lazy(() => import("./pages/VolatilityPage").then(m => ({ default: m.VolatilityPage })));
const ComparePage = lazy(() => import("./pages/ComparePage").then(m => ({ default: m.ComparePage })));

function LazyFallback() {
  return <div className="skeleton skeleton-chart" style={{ minHeight: 400 }} />;
}

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
      { path: "rrg", element: <Suspense fallback={<LazyFallback />}><RRGPage /></Suspense> },
      { path: "rrg/sectors", element: <Suspense fallback={<LazyFallback />}><RRGPage /></Suspense> },
      { path: "rrg/cross-asset", element: <Suspense fallback={<LazyFallback />}><RRGPage /></Suspense> },
      { path: "prices", element: <Suspense fallback={<LazyFallback />}><PriceExplorerPage /></Suspense> },
      { path: "capital-flow", element: <Suspense fallback={<LazyFallback />}><FlowStructurePage /></Suspense> },
      { path: "regime", element: <Suspense fallback={<LazyFallback />}><MarketRegimePage /></Suspense> },
      { path: "volatility", element: <Suspense fallback={<LazyFallback />}><VolatilityPage /></Suspense> },
      { path: "compare", element: <Suspense fallback={<LazyFallback />}><ComparePage /></Suspense> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return (
    <CompareProvider>
      <RouterProvider router={router} />
      <Analytics />
    </CompareProvider>
  );
}
