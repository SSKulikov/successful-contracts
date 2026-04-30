import { fromPath } from "pdf2pic";
import Tesseract from "tesseract.js";
import * as fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { logger } from "../../utils/logger"; // Подключаем pdf-lib

export class PdfService {
  constructor() {}

  private isReadableExtractedText(text: string): boolean {
    const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
    if (normalized.length < 120) return false;
    const letters = normalized.match(/[A-Za-zА-Яа-яЁё]/g)?.length ?? 0;
    const readableChars = normalized.match(/[A-Za-zА-Яа-яЁё0-9.,:;()\-/"'№ ]/g)?.length ?? 0;
    return letters >= 80 && readableChars / normalized.length >= 0.7;
  }

  async convertPdf(pdfName: string) {
    const pdfPath = path.join(
      process.cwd(),
      "storage",
      "pdf",
      `${pdfName}.pdf`
    );
    const outputDir = path.join(process.cwd(), "storage", "img", pdfName);
    const textFilePath = path.join(
      process.cwd(),
      "storage",
      "text",
      `${pdfName}.txt`
    );
    const textDir = path.dirname(textFilePath);

    // Создаем директорию для изображений
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(textDir)) {
      fs.mkdirSync(textDir, { recursive: true });
    }

    const options = {
      density: 400, // Выше DPI для лучшего OCR на сканах
      savePath: outputDir, // Папка для картинок
      format: "png",
      preserveAspectRatio: true
    };

    const converter = fromPath(pdfPath, options);

    // Получаем количество страниц с помощью pdf-lib
    const pdfData = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfData);
    const totalPages = pdfDoc.getPages().length;

    logger.info(`Всего страниц в PDF: ${totalPages}`);

    try {
      const parser = new PDFParse({ data: pdfData });
      const parsed = await parser.getText();
      await parser.destroy();
      const directText = String(parsed?.text ?? "").trim();
      if (this.isReadableExtractedText(directText)) {
        fs.writeFileSync(textFilePath, directText, "utf8");
        logger.info(`Текст извлечён напрямую из PDF: ${textFilePath}`);
        return textFilePath;
      }
      logger.info("Встроенный текст PDF пустой/нечитаемый, запускается OCR");
    } catch (error) {
      logger.warn(`Не удалось извлечь встроенный текст PDF, запускается OCR: ${error}`);
    }

    // Массив для обработки всех страниц параллельно
    const pagePromises = Array.from({ length: totalPages }, (_, index) => {
      const page = index + 1; // Старт с 1, а не с 0
      return new Promise(async (resolve, reject) => {
        try {
          const pageResult = await converter(page, { responseType: "image" });

          if (pageResult.path) {
            logger.info(
              `Изображение страницы ${page} сохранено: ${pageResult.path}`
            );

            // Распознаем текст с изображения
            const { data } = await Tesseract.recognize(pageResult.path, "rus+eng");
            logger.info(`Текст страницы ${page} распознан`);

            resolve({ page, text: data.text });
          } else {
            reject(`Ошибка при конвертации страницы ${page}`);
          }
        } catch (error) {
          reject(`Ошибка на странице ${page}: ${error}`);
        }
      });
    });

    // Параллельно обрабатываем все страницы
    const results = await Promise.allSettled(pagePromises);

    // Обрабатываем результат
    let textContent = "";
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        // @ts-ignore
        textContent += `\n=== Страница ${result.value.page} ===\n${result.value.text}\n`;
        // @ts-ignore
        logger.info(`Текст с страницы ${result.value.page} добавлен`);
      } else {
        logger.error(`Ошибка: ${result.reason}`);
      }
    });

    if (!textContent.trim()) {
      throw new Error(
        "Не удалось извлечь текст из PDF. Установите GraphicsMagick/ImageMagick (команда `gm`/`convert`) и повторите попытку."
      );
    }

    // Сохраняем текст в файл
    fs.writeFileSync(textFilePath, textContent, "utf8");
    logger.info(`Распознанный текст сохранён в файл: ${textFilePath}`);

    // Удаляем папку с изображениями
    // fs.rmSync(outputDir, { recursive: true, force: true });
    logger.info(`Удалена папка с изображениями: ${outputDir}`);

    return textFilePath;
  }
}
