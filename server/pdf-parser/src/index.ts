import fs from "fs";
import path from "path";
import express from "express";
import fileRoutes from "./routes";
import cors from "cors";
import { logger } from "./utils/logger";
import dotenv from "dotenv";
import { getHealth } from "./controllers/health.controller";
import { getCorsOptions } from "./utils/cors-config";

// Сначала `.env` в корне репозитория (рядом с docker-compose), затем `server/pdf-parser/.env` — второй перекрывает первый.
// Иначе при `npm start` из `server/pdf-parser` переменные из корня не подхватывались, в т.ч. REDIS_URL.
const envFromRepoRoot = path.resolve(__dirname, "../../../.env");
const envFromPdfParser = path.resolve(__dirname, "../.env");
if (fs.existsSync(envFromRepoRoot)) dotenv.config({ path: envFromRepoRoot });
if (fs.existsSync(envFromPdfParser)) dotenv.config({ path: envFromPdfParser });
const app = express();
const PORT = 3003;

app.use(express.json());
app.use(cors(getCorsOptions()));
// Тот же обработчик, что GET /api/health — удобно для прокси, которые не префиксуют /api
app.get("/health", getHealth);
app.use("/api", fileRoutes); // Подключаем маршруты

app.listen(PORT, () => {
  logger.info(`🚀 Сервер запущен на http://localhost:${PORT}`);
  const co = process.env.CORS_ORIGIN?.trim();
  logger.info(
    co
      ? `CORS: разрешены origin — ${co}`
      : "CORS: CORS_ORIGIN не задан, допускаются запросы с любого origin"
  );
});
