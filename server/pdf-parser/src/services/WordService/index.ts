import * as fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { logger } from "../../utils/logger";

export class WordService {
  constructor() {}

  async convertWord(wordName: string) {
    const wordPath = path.join(
      process.cwd(),
      "storage",
      "word",
      `${wordName}.docx`
    );
    const textFilePath = path.join(
      process.cwd(),
      "storage",
      "text",
      `${wordName}.txt`
    );

    // Проверяем, существует ли файл
    if (!fs.existsSync(wordPath)) {
      throw new Error(`Файл ${wordPath} не найден`);
    }

    try {
      // Извлекаем текст из DOCX
      const { value: extractedText } = await mammoth.extractRawText({
        path: wordPath,
      });

      // Сохраняем текст в файл
      fs.writeFileSync(textFilePath, extractedText, "utf8");
      logger.info(`Текст из Word-файла сохранён: ${textFilePath}`);

      // Удаляем оригинальный файл
      fs.unlinkSync(wordPath);
      logger.info(`Удалён исходный Word-файл: ${wordPath}`);

      return textFilePath;
    } catch (error) {
      logger.error("Ошибка при обработке Word-файла:", error);
      throw error;
    }
  }
}
