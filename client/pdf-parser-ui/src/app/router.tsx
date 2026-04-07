import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../shared/layout/AppLayout";
import { AuthPage } from "../pages/AuthPage";
import { ContractsPage } from "../pages/ContractsPage";
import { LandingPage } from "../pages/LandingPage";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "auth", element: <AuthPage /> },
      { path: "contracts", element: <ContractsPage /> }
    ]
  }
]);
