import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { SectorRRGPage } from "./pages/SectorRRGPage";
import { CrossAssetRRGPage } from "./pages/CrossAssetRRGPage";
import { PriceExplorerPage } from "./pages/PriceExplorerPage";
import { RankingsPage } from "./pages/RankingsPage";
import { OBVStructurePage } from "./pages/OBVStructurePage";

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
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
