import type { EmployeeAccountRow } from "./employee-account";
import type { EmployeeAuthContext } from "../utils/auth-context";

declare global {
  namespace Express {
    interface Request {
      /** Заполняется `requireAuth`: строка сотрудника из БД. */
      authEmployee?: EmployeeAccountRow;
      /** Заполняется `requireAuth`: контекст для RBAC и фильтров по компании. */
      authContext?: EmployeeAuthContext;
    }
  }
}

export {};
