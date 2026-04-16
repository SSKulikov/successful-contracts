import { Router } from "express";
import { parseFile } from "./controllers/file.controller";
import { saveData } from "./controllers/save.controller";
import { createEmployee, listEmployees } from "./controllers/admin.controller";
import {
  createCompany,
  deleteCompany,
  listCompanies,
  resetCompanyAdmin,
  updateCompany
} from "./controllers/companies.controller";
import { changeMyPassword, getMyProfile, login, updateMyProfile } from "./controllers/auth.controller";
import {
  createDocument,
  deleteDocument,
  exportDocumentsXlsx,
  getDocumentById,
  listMyDocuments,
  getMyDocumentsStatusStats,
  resubmitDocument,
  submitDocument,
  updateDocument,
  withdrawDocument
} from "./controllers/documents.controller";
import { approveTask, listMyApprovals, rejectTask, reviseTask } from "./controllers/approvals.controller";
import { createRouteAdmin, listRoutesAdmin, updateRouteAdmin, deleteRouteAdmin, listCompanyRoutes } from "./controllers/approval-routes.controller";
import { getHealth } from "./controllers/health.controller";
import { requireAuth } from "./middleware/requireAuth";
import { requirePlatformAdmin } from "./middleware/requirePlatformAdmin";

const router = Router();

router.get("/health", getHealth);
router.post("/parse-file", parseFile);
router.post("/save-data-info", saveData);
router.get("/admin/employees", requireAuth, requirePlatformAdmin, listEmployees);
router.post("/admin/employees", requireAuth, requirePlatformAdmin, createEmployee);
router.get("/admin/companies", requireAuth, requirePlatformAdmin, listCompanies);
router.post("/admin/companies", requireAuth, requirePlatformAdmin, createCompany);
router.patch("/admin/companies/:id", requireAuth, requirePlatformAdmin, updateCompany);
router.delete("/admin/companies/:id", requireAuth, requirePlatformAdmin, deleteCompany);
router.post("/admin/companies/:id/reset-admin", requireAuth, requirePlatformAdmin, resetCompanyAdmin);
router.get("/admin/routes", requireAuth, requirePlatformAdmin, listRoutesAdmin);
router.post("/admin/routes", requireAuth, requirePlatformAdmin, createRouteAdmin);
router.put("/admin/routes/:id", requireAuth, requirePlatformAdmin, updateRouteAdmin);
router.delete("/admin/routes/:id", requireAuth, requirePlatformAdmin, deleteRouteAdmin);
router.get("/company/approval-routes", requireAuth, listCompanyRoutes);
router.post("/auth/login", login);
router.get("/users/me", requireAuth, getMyProfile);
router.patch("/users/me", requireAuth, updateMyProfile);
router.post("/users/me/change-password", requireAuth, changeMyPassword);
router.post("/documents", requireAuth, createDocument);
router.get("/documents/my", requireAuth, listMyDocuments);
router.get("/documents/my/stats", requireAuth, getMyDocumentsStatusStats);
router.get("/documents/export.xlsx", requireAuth, exportDocumentsXlsx);
router.get("/documents/:id", requireAuth, getDocumentById);
router.patch("/documents/:id", requireAuth, updateDocument);
router.post("/documents/:id/submit", requireAuth, submitDocument);
router.post("/documents/:id/resubmit", requireAuth, resubmitDocument);
router.post("/documents/:id/withdraw", requireAuth, withdrawDocument);
router.delete("/documents/:id", requireAuth, deleteDocument);
router.get("/approvals/my", requireAuth, listMyApprovals);
router.post("/approvals/:taskId/approve", requireAuth, approveTask);
router.post("/approvals/:taskId/reject", requireAuth, rejectTask);
router.post("/approvals/:taskId/revise", requireAuth, reviseTask);

export default router;
