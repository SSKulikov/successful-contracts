import express from "express";
import fileRoutes from "./routes";
import cors from "cors";
import { logger } from "./utils/logger";
import dotenv from "dotenv";
import { getHealth } from "./controllers/health.controller";
import { getCorsOptions } from "./utils/cors-config";

dotenv.config();
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
