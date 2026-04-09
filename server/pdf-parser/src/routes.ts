import { Router } from "express";
import { parseFile } from "./controllers/file.controller";
import { saveData } from "./controllers/save.controller";
import { createEmployee, listEmployees } from "./controllers/admin.controller";
import { changeMyPassword, getMyProfile, login, updateMyProfile } from "./controllers/auth.controller";

const router = Router();

router.post("/parse-file", parseFile);
router.post("/save-data-info", saveData);
router.get("/admin/employees", listEmployees);
router.post("/admin/employees", createEmployee);
router.post("/auth/login", login);
router.get("/users/me", getMyProfile);
router.patch("/users/me", updateMyProfile);
router.post("/users/me/change-password", changeMyPassword);

export default router;
