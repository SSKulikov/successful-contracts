import { useMemo } from "react";
import { getStoredUserProfile, isPlatformAdminUser } from "../shared/api";
import { PlatformCompaniesPage } from "./PlatformCompaniesPage";
import { CompanyManagementPage } from "./CompanyManagementPage";

export function DynamicAdminPage() {
  const user = getStoredUserProfile();
  const isPlatformAdmin = useMemo(() => (user ? isPlatformAdminUser(user) : false), [user]);
  if (isPlatformAdmin) return <PlatformCompaniesPage />;
  return <CompanyManagementPage />;
}
