import express from "express";
import fileRoutes from "./routes";
import cors from "cors";
import { logger } from "./utils/logger";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = 3003;

app.use(express.json());
app.use(cors());
app.use("/api", fileRoutes); // Подключаем маршруты

app.listen(PORT, () => {
  logger.info(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
