import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../shared/layout/AppLayout";
import { ContractsPage } from "../pages/ContractsPage";
import { LandingPage } from "../pages/LandingPage";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "contracts", element: <ContractsPage /> }
    ]
  }
]);
