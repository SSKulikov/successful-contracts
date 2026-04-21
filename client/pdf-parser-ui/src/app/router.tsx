import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { Spin } from "antd";
import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../shared/layout/AppLayout";

const LandingPage = lazy(() => import("../pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const AuthPage = lazy(() => import("../pages/AuthPage").then((m) => ({ default: m.AuthPage })));
const WorkspacePage = lazy(() => import("../pages/WorkspacePage").then((m) => ({ default: m.WorkspacePage })));
const MyDocumentsPage = lazy(() => import("../pages/MyDocumentsPage").then((m) => ({ default: m.MyDocumentsPage })));
const DocumentDetailsPage = lazy(() => import("../pages/DocumentDetailsPage").then((m) => ({ default: m.DocumentDetailsPage })));
const MyApprovalsPage = lazy(() => import("../pages/MyApprovalsPage").then((m) => ({ default: m.MyApprovalsPage })));
const ProfilePage = lazy(() => import("../pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const AdminPanelPage = lazy(() => import("../pages/AdminPanelPage").then((m) => ({ default: m.AdminPanelPage })));

function withSuspense(element: ReactNode) {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center" }}><Spin /></div>}>
      {element}
    </Suspense>
  );
}

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: withSuspense(<LandingPage />) },
      { path: "auth", element: withSuspense(<AuthPage />) },
      { path: "workspace", element: withSuspense(<WorkspacePage />) },
      { path: "my-documents", element: withSuspense(<MyDocumentsPage />) },
      { path: "documents/:id", element: withSuspense(<DocumentDetailsPage />) },
      { path: "my-approvals", element: withSuspense(<MyApprovalsPage />) },
      { path: "profile", element: withSuspense(<ProfilePage />) },
      { path: "admin-panel", element: withSuspense(<AdminPanelPage />) }
    ]
  }
]);
