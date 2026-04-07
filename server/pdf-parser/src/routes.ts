import { Router } from "express";
import { parseFile } from "./controllers/file.controller";
import { saveData } from "./controllers/save.controller";

const router = Router();

router.post("/parse-file", parseFile);
router.post("/save-data-info", saveData);

export default router;
