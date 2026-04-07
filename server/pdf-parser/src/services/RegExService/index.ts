import fs from "fs";
import path from "path";
import { logger } from "../../utils/logger";

export class RegExService {
  private requisitesRegex =
    /(?:\d+\.\s*)?(?:[Рр]еквизиты(?:\s+[Сс]торон)?|Адреса\s+и\s+[Рр]еквизиты)/gimu;
  private subjectRegex = /(?:\d+\.\s*)?[Пп]редмет(?:ом)?\s+[Дд]оговора/gimu;
  private paymentRegex =
    /(?:\d+\.\s*)?(?:[Цц]ена\s+[Дд]оговора|[Сс]тоимость\s+[Уу]слуг|[Оо]бщая\s+стоимость|[Оо]плат[ау]|[Пп]латеж)/gimu;
  private size = 5000;
  constructor() {}

  public parseFullData(textName: string): string[] {
    const textPath = path.join(
      process.cwd(),
      "storage",
      "text",
      `${textName}.txt`
    );

    let textData = "";
    try {
      textData = fs.readFileSync(textPath, "utf8");
    } catch (error) {
      logger.error("Ошибка при чтении файла:", error);
      return [];
    }

    // Удаляем лишние пробелы (более одного)
    textData = textData.replace(/\s{2,}/g, " ");

    // Разделяем текст на части по 1000 символов
    const parts: string[] = [];
    for (let i = 0; i < textData.length; i += this.size) {
      parts.push(textData.slice(i, i + this.size));
    }

    return parts;
  }

  public parseRequisites(textName: string): string | null {
    let finalData = "";
    const textPath = path.join(
      process.cwd(),
      "storage",
      "text",
      `${textName}.txt`
    );

    let textData = "";
    try {
      textData = fs.readFileSync(textPath, "utf8");
    } catch (error) {
      logger.error("Ошибка при чтении файла:", error);
      return null;
    }

    finalData += textData.slice(0, 100);

    // Массив для хранения всех совпадений
    const matches: string[] = [];
    const result: string[] = [];

    let match;
    let lastMatchIndex = -1;

    let submatch;

    while ((submatch = this.subjectRegex.exec(textData)) !== null) {
      const startIndex = submatch.index; // Индекс совпадения
      const lines = textData.slice(startIndex).split("\n"); // Разбиваем с места совпадения
      const resultText = lines.slice(0, 10).join(" ").trim(); // Берем 10 строк
      finalData += resultText;
    }

    // Проходим по всем совпадениям
    while ((match = this.requisitesRegex.exec(textData)) !== null) {
      // Добавляем найденный текст в массив совпадений
      matches.push(match[0]);
      lastMatchIndex = match.index;

      // Извлекаем следующие 100 строк после каждого совпадения
      const textAfterMatch = textData.slice(lastMatchIndex);

      // Разбиваем на строки
      const lines = textAfterMatch.split("\n");

      // Объединяем все 100 строк в одну строку
      const resultLine = lines.slice(0, 100).join(" ").trim(); // объединение через пробел, чтобы убрать лишние переносы

      // Добавляем результат для этого совпадения
      result.push(resultLine);
    }

    // Если совпадений нет, возвращаем null
    if (result.length === 0) {
      return null;
    }

    result.forEach((data) => {
      if (
        data.includes("ИНН") ||
        data.includes("инн") ||
        data.includes("КПП") ||
        data.includes("кпп") ||
        data.includes("БИК") ||
        data.includes("бик")
      )
        finalData += data;
    });

    if (!finalData) finalData += result[0];
    return finalData;
  }

  public parsePaymentTerms(textName: string): string | null {
    let finalData = "";
    const textPath = path.join(
      process.cwd(),
      "storage",
      "text",
      `${textName}.txt`
    );

    let textData = "";
    try {
      textData = fs.readFileSync(textPath, "utf8");
    } catch (error) {
      logger.error("Ошибка при чтении файла:", error);
      return null;
    }

    let match;
    while ((match = this.paymentRegex.exec(textData)) !== null) {
      const startIndex = match.index;
      const lines = textData.slice(startIndex).split("\n");
      const resultText = lines.slice(0, 15).join(" ").trim(); // Берем 15 строк в запас
      finalData += resultText + "\n\n";
    }

    return finalData || null;
  }
}
