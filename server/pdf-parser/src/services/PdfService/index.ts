import { fromPath } from "pdf2pic";
import Tesseract from "tesseract.js";
import * as fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { logger } from "../../utils/logger"; // Подключаем pdf-lib

export class PdfService {
  constructor() {}

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

    // Создаем директорию для изображений
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const options = {
      density: 300, // Хорошее качество
      savePath: outputDir, // Папка для картинок
      format: "png",
      width: 1920,
      height: 1080,
      preserveAspectRatio: true,
    };

    const converter = fromPath(pdfPath, options);

    // Получаем количество страниц с помощью pdf-lib
    const pdfData = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfData);
    const totalPages = pdfDoc.getPages().length;

    logger.info(`Всего страниц в PDF: ${totalPages}`);

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
            const { data } = await Tesseract.recognize(
              pageResult.path,
              "rus+eng"
            );
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

    // Сохраняем текст в файл
    fs.writeFileSync(textFilePath, textContent, "utf8");
    logger.info(`Распознанный текст сохранён в файл: ${textFilePath}`);

    // Удаляем папку с изображениями
    fs.rmSync(outputDir, { recursive: true, force: true });
    logger.info(`Удалена папка с изображениями: ${outputDir}`);

    return textFilePath;
  }
}
