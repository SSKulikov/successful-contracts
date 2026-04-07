import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PdfService } from "../services/PdfService";
import { WordService } from "../services/WordService";
import { RegExService } from "../services/RegExService";
import { logger } from "../utils/logger";
import { ValidatorService } from "../services/ValidatorService";
import { allRequisitesPrompt } from "../consts/prompts";
import { parsedData } from "../dto";
import { scheduler } from "node:timers/promises";
import {GigaChatService} from "../services/GigaChatService";

const pdf = new PdfService();
const word = new WordService();
const parse = new RegExService();
const gigaChat = new GigaChatService();
const validator = new ValidatorService();

async function parseFunc(filename: string, fileExtension: string) {
  let parsedData: parsedData = {
    contract_type: null,
    contract_number: null,
    contract_subject: null,
    contract_sum: null,
    contract_currency: null,
    payment_1_sum: null,
    payment_1_date: null,
    payment_2_sum: null,
    payment_2_date: null,
    contract_date: null,
    contract_start_date: null,
    contract_end_date: null,
    item: null,
    supplier: {
      name: null,
      inn: null,
      kpp: null,
      ogrn: null,
      bik: null,
      corr_account: null,
      payment_account: null,
      email: null,
      phone: null,
      address: null,
      bank_name: null,
    },
    customer: {
      name: null,
      inn: null,
      kpp: null,
      ogrn: null,
      bik: null,
      corr_account: null,
      payment_account: null,
      email: null,
      phone: null,
      address: null,
      bank_name: null,
    },
  };
  if (fileExtension === ".pdf") {
    await pdf.convertPdf(filename);
  } else {
    await word.convertWord(filename);
  }
  const documentArr = parse.parseFullData(filename);
  const requisites = parse.parseRequisites(filename);
  const paymentData = parse.parsePaymentTerms(filename);


  const results = [];

  for (const data of documentArr) {
    try {
      const result = await gigaChat.makeRequest(data);
      if (!result) {
        results.push({ status: "rejected", reason: "Empty result" });
        continue;
      }
      results.push({ status: "fulfilled", value: result });
    } catch (error) {
      console.error("Ошибка при обработке запроса:", error);
      results.push({ status: "rejected", reason: error });
    }
  }

  for (const res of results) {
    if (res.status !== "fulfilled" || !res.value) continue;

    const result = res.value;

    parsedData.contract_type ??= result.contract_type ?? null;
    parsedData.contract_number ??= result.contract_number ?? null;
    parsedData.contract_subject ??= result.contract_subject ?? null;
    parsedData.contract_sum ??= result.contract_sum ?? null;
    parsedData.contract_currency ??= result.contract_currency ?? null;
    parsedData.payment_1_sum ??= result.payment_1_sum ?? null;
    parsedData.payment_1_date ??= result.payment_1_date ?? null;
    parsedData.payment_2_sum ??= result.payment_2_sum ?? null;
    parsedData.payment_2_date ??= result.payment_2_date ?? null;
    parsedData.contract_date ??= result.contract_date ?? null;
    parsedData.contract_start_date ??= result.contract_start_date ?? null;
    parsedData.contract_end_date ??= result.contract_end_date ?? null;
    parsedData.item ??= result.item ?? null;

    parsedData.supplier.name ??= result.supplier?.name ?? null;
    parsedData.supplier.inn ??= result.supplier?.inn ?? null;
    parsedData.supplier.kpp ??= result.supplier?.kpp ?? null;
    parsedData.supplier.ogrn ??= result.supplier?.ogrn ?? null;
    parsedData.supplier.bik ??= result.supplier?.bik ?? null;
    parsedData.supplier.corr_account ??= result.supplier?.corr_account ?? null;
    parsedData.supplier.payment_account ??=
      result.supplier?.payment_account ?? null;
    parsedData.supplier.email ??= result.supplier?.email ?? null;
    parsedData.supplier.phone ??= result.supplier?.phone ?? null;
    parsedData.supplier.address ??= result.supplier?.address ?? null;
    parsedData.supplier.bank_name ??= result.supplier?.bank_name ?? null;

    parsedData.customer.name ??= result.customer?.name ?? null;
    parsedData.customer.inn ??= result.customer?.inn ?? null;
    parsedData.customer.kpp ??= result.customer?.kpp ?? null;
    parsedData.customer.ogrn ??= result.customer?.ogrn ?? null;
    parsedData.customer.bik ??= result.customer?.bik ?? null;
    parsedData.customer.corr_account ??= result.customer?.corr_account ?? null;
    parsedData.customer.payment_account ??=
      result.customer?.payment_account ?? null;
    parsedData.customer.email ??= result.customer?.email ?? null;
    parsedData.customer.phone ??= result.customer?.phone ?? null;
    parsedData.customer.address ??= result.customer?.address ?? null;
    parsedData.customer.bank_name ??= result.customer?.bank_name ?? null;
  }

  return validator.validateParsedData(parsedData);
}

// Функция для определения папки хранения в зависимости от типа файла
const getUploadDir = (mimetype: string) => {
  if (mimetype === "application/pdf")
    return path.join(__dirname, "../../storage/pdf");
  if (
    [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(mimetype)
  ) {
    return path.join(__dirname, "../../storage/word");
  }
  return null;
};

// Настройка хранилища файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = getUploadDir(file.mimetype);
    if (!uploadDir) return cb(new Error("Неподдерживаемый формат файла"), "");

    // Создаем папку, если ее нет
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage }).single("file");

// Контроллер загрузки файла
export const parseFile = (req: Request, res: Response) => {
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

    try {
      const fileExtension = path.extname(req.file.originalname); // Получаем расширение файла
      const fileNameWithoutExtension = path.parse(req.file.filename).name; // Получаем имя файла без расширения
      const parsedJson = await parseFunc(fileNameWithoutExtension, fileExtension);
      // Возвращаем parsedJson вместе с другими данными
      res.json({
        message: "Файл загружен",
        filename: req.file.filename,
        path: req.file.path,
        parsedJson, // Добавляем parsedJson в ответ
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ошибка обработки файла";
      logger.error(`Ошибка parse-file: ${message}`);
      return res.status(500).json({ error: message });
    }
  });
};
