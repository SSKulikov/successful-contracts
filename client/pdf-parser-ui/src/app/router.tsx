import { createBrowserRouter } from "react-router-dom";
import { AdminPanelPage } from "../pages/AdminPanelPage";
import { AppLayout } from "../shared/layout/AppLayout";
import { AuthPage } from "../pages/AuthPage";
import { DocumentDetailsPage } from "../pages/DocumentDetailsPage";
import { LandingPage } from "../pages/LandingPage";
import { MyApprovalsPage } from "../pages/MyApprovalsPage";
import { MyDocumentsPage } from "../pages/MyDocumentsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { WorkspacePage } from "../pages/WorkspacePage";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "auth", element: <AuthPage /> },
      { path: "workspace", element: <WorkspacePage /> },
      { path: "my-documents", element: <MyDocumentsPage /> },
      { path: "documents/:id", element: <DocumentDetailsPage /> },
      { path: "my-approvals", element: <MyApprovalsPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "admin-panel", element: <AdminPanelPage /> }
    ]
  }
]);
