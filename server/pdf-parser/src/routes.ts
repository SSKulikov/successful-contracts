import { Router } from "express";
import { parseFile } from "./controllers/file.controller";
import { saveData } from "./controllers/save.controller";
import {
  createEmployee,
  listEmployees,
  resetEmployeePassword,
  softDeleteEmployee,
  updateEmployee
} from "./controllers/admin.controller";
import {
  assignCompanyAdmin,
  createCompany,
  deleteCompany,
  listCompanies,
  resetCompanyAdmin,
  updateCompany
} from "./controllers/companies.controller";
import { changeMyPassword, getMyProfile, login, updateMyProfile, uploadMyAvatar } from "./controllers/auth.controller";
import {
  createDocument,
  deleteDocument,
  exportDocumentsXlsx,
  getDocumentById,
  listCompanyEmployees,
  listMyDocuments,
  getMyDocumentsStatusStats,
  resubmitDocument,
  submitDocument,
  updateDocument,
  withdrawDocument
} from "./controllers/documents.controller";
import { approveTask, listMyApprovals, rejectTask, reviseTask } from "./controllers/approvals.controller";
import {
  getUnreadNotificationsCount,
  listNotifications,
  markNotificationRead
} from "./controllers/notifications.controller";
import { createRouteAdmin, listRoutesAdmin, updateRouteAdmin, deleteRouteAdmin, listCompanyRoutes } from "./controllers/approval-routes.controller";
import { getHealth } from "./controllers/health.controller";
import { requireAuth } from "./middleware/requireAuth";
import { requirePasswordNotTemporary } from "./middleware/requirePasswordNotTemporary";
import { requirePlatformAdmin } from "./middleware/requirePlatformAdmin";
import { loginRateLimiter } from "./middleware/loginRateLimiter";
import { handleAvatarUpload } from "./middleware/uploadAvatar";

const router = Router();

router.get("/health", getHealth);
router.post("/parse-file", parseFile);
router.post("/save-data-info", saveData);
router.get("/admin/employees", requireAuth, requirePlatformAdmin, listEmployees);
router.post("/admin/employees", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, createEmployee);
router.patch("/admin/employees/:id", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, updateEmployee);
router.post(
  "/admin/employees/:id/reset-password",
  requireAuth,
  requirePasswordNotTemporary,
  requirePlatformAdmin,
  resetEmployeePassword
);
router.delete("/admin/employees/:id", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, softDeleteEmployee);
router.get("/admin/companies", requireAuth, requirePlatformAdmin, listCompanies);
router.post("/admin/companies", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, createCompany);
router.patch("/admin/companies/:id", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, updateCompany);
router.post("/admin/companies/:id/assign-admin", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, assignCompanyAdmin);
router.delete("/admin/companies/:id", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, deleteCompany);
router.post("/admin/companies/:id/reset-admin", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, resetCompanyAdmin);
router.get("/admin/routes", requireAuth, requirePlatformAdmin, listRoutesAdmin);
router.post("/admin/routes", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, createRouteAdmin);
router.put("/admin/routes/:id", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, updateRouteAdmin);
router.delete("/admin/routes/:id", requireAuth, requirePasswordNotTemporary, requirePlatformAdmin, deleteRouteAdmin);
router.get("/company/approval-routes", requireAuth, listCompanyRoutes);
router.get("/company/employees", requireAuth, listCompanyEmployees);
router.post("/auth/login", loginRateLimiter, login);
router.get("/users/me", requireAuth, getMyProfile);
router.patch("/users/me", requireAuth, requirePasswordNotTemporary, updateMyProfile);
router.post("/users/me/avatar", requireAuth, requirePasswordNotTemporary, handleAvatarUpload, uploadMyAvatar);
router.post("/users/me/change-password", requireAuth, changeMyPassword);
router.post("/documents", requireAuth, requirePasswordNotTemporary, createDocument);
router.get("/documents/my", requireAuth, listMyDocuments);
router.get("/documents/my/stats", requireAuth, getMyDocumentsStatusStats);
router.get("/documents/export.xlsx", requireAuth, exportDocumentsXlsx);
router.get("/documents/:id", requireAuth, getDocumentById);
router.patch("/documents/:id", requireAuth, requirePasswordNotTemporary, updateDocument);
router.post("/documents/:id/submit", requireAuth, requirePasswordNotTemporary, submitDocument);
router.post("/documents/:id/resubmit", requireAuth, requirePasswordNotTemporary, resubmitDocument);
router.post("/documents/:id/withdraw", requireAuth, requirePasswordNotTemporary, withdrawDocument);
router.delete("/documents/:id", requireAuth, requirePasswordNotTemporary, deleteDocument);
router.get("/notifications", requireAuth, listNotifications);
router.get("/notifications/unread-count", requireAuth, getUnreadNotificationsCount);
router.post("/notifications/:id/read", requireAuth, requirePasswordNotTemporary, markNotificationRead);
router.get("/approvals/my", requireAuth, listMyApprovals);
router.post("/approvals/:taskId/approve", requireAuth, requirePasswordNotTemporary, approveTask);
router.post("/approvals/:taskId/reject", requireAuth, requirePasswordNotTemporary, rejectTask);
router.post("/approvals/:taskId/revise", requireAuth, requirePasswordNotTemporary, reviseTask);

export default router;
