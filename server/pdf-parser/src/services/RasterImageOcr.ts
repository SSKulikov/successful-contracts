import fs from "fs";
import path from "path";
import Tesseract from "tesseract.js";
import { logger } from "../utils/logger";

/** OCR изображения (JPG/PNG/WebP) в `storage/text/{baseName}.txt` — тот же контракт, что после `PdfService.convertPdf`. */
export async function recognizeRasterImageToTextFile(fileBaseNameWithoutExt: string, sourceImageAbsolutePath: string): Promise<void> {
  const textDir = path.join(process.cwd(), "storage", "text");
  const textFilePath = path.join(textDir, `${fileBaseNameWithoutExt}.txt`);
  if (!fs.existsSync(textDir)) {
    fs.mkdirSync(textDir, { recursive: true });
  }

  const { data } = await Tesseract.recognize(sourceImageAbsolutePath, "rus+eng", { logger: () => undefined });
  const text = (data.text ?? "").trim();
  if (!text) {
    throw new Error(
      "Не удалось распознать текст на изображении. Проверьте качество снимка или введите поля вручную."
    );
  }

  fs.writeFileSync(textFilePath, text, "utf8");
  logger.info(`Текст с растрового изображения сохранён: ${textFilePath}`);
}
