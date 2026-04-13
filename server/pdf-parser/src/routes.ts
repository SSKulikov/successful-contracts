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
import { getHealth } from "./controllers/health.controller";
import { requirePlatformAdmin } from "./middleware/requirePlatformAdmin";

const router = Router();

router.get("/health", getHealth);
router.post("/parse-file", parseFile);
router.post("/save-data-info", saveData);
router.get("/admin/employees", requirePlatformAdmin, listEmployees);
router.post("/admin/employees", requirePlatformAdmin, createEmployee);
router.get("/admin/companies", requirePlatformAdmin, listCompanies);
router.post("/admin/companies", requirePlatformAdmin, createCompany);
router.patch("/admin/companies/:id", requirePlatformAdmin, updateCompany);
router.delete("/admin/companies/:id", requirePlatformAdmin, deleteCompany);
router.post("/admin/companies/:id/reset-admin", requirePlatformAdmin, resetCompanyAdmin);
router.post("/auth/login", login);
router.get("/users/me", getMyProfile);
router.patch("/users/me", updateMyProfile);
router.post("/users/me/change-password", changeMyPassword);
router.post("/documents", createDocument);
router.get("/documents/my", listMyDocuments);
router.get("/documents/my/stats", getMyDocumentsStatusStats);
router.get("/documents/export.xlsx", exportDocumentsXlsx);
router.get("/documents/:id", getDocumentById);
router.patch("/documents/:id", updateDocument);
router.post("/documents/:id/submit", submitDocument);
router.post("/documents/:id/resubmit", resubmitDocument);
router.post("/documents/:id/withdraw", withdrawDocument);
router.delete("/documents/:id", deleteDocument);
router.get("/approvals/my", listMyApprovals);
router.post("/approvals/:taskId/approve", approveTask);
router.post("/approvals/:taskId/reject", rejectTask);
router.post("/approvals/:taskId/revise", reviseTask);

export default router;
