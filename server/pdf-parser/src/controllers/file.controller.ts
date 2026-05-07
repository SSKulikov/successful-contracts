import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  buildParsePipelineCacheKey,
  getJson,
  getParsePipelineCacheTtlSeconds,
  setJson,
  setParseNormalizedDataHash
} from "../cache/redis";
import { PdfService } from "../services/PdfService";
import { WordService } from "../services/WordService";
import { recognizeRasterImageToTextFile } from "../services/RasterImageOcr";
import { RegExService } from "../services/RegExService";
import { logger } from "../utils/logger";
import { ValidatorService } from "../services/ValidatorService";
import { parsedData } from "../dto";
import { GigaChatService } from "../services/GigaChatService";
import { sha256HexOfFileBytes, sha256HexOfStableJson } from "../utils/stableContentHash";
import { YaGptService } from "../services/YaGptService";
import { allRequisitesPrompt } from "../consts/prompts";

const pdf = new PdfService();
const word = new WordService();
const parse = new RegExService();
const gigaChat = new GigaChatService();
const yandexGpt = new YaGptService();
const validator = new ValidatorService();

const RASTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const SUPPORTED_LLM_PROVIDERS = new Set(["gigachat", "yagpt"]);

function resolveLlmProvider(): "gigachat" | "yagpt" {
  const raw = (process.env.LLM_PROVIDER ?? "gigachat").trim().toLowerCase();
  if (SUPPORTED_LLM_PROVIDERS.has(raw)) {
    return raw as "gigachat" | "yagpt";
  }
  logger.warn(`Неизвестный LLM_PROVIDER='${raw}', используется gigachat`);
  return "gigachat";
}

async function parseFunc(filename: string, fileExtension: string, rasterSourceAbsolutePath?: string) {
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
  const extLower = fileExtension.toLowerCase();
  if (extLower === ".pdf") {
    await pdf.convertPdf(filename);
  } else if (extLower === ".doc" || extLower === ".docx") {
    await word.convertWord(filename);
  } else if (RASTER_EXTENSIONS.has(extLower)) {
    if (!rasterSourceAbsolutePath) {
      throw new Error("Внутренняя ошибка: не передан путь к изображению");
    }
    await recognizeRasterImageToTextFile(filename, rasterSourceAbsolutePath);
  } else {
    throw new Error(`Неподдерживаемое расширение для распознавания: ${fileExtension}`);
  }
  const documentArr = parse.parseFullData(filename);
  const requisites = parse.parseRequisites(filename);
  const paymentData = parse.parsePaymentTerms(filename);


  const results = [];
  const llmProvider = resolveLlmProvider();

  for (const data of documentArr) {
    try {
      const result =
        llmProvider === "yagpt"
          ? await yandexGpt.makeRequest(data, allRequisitesPrompt)
          : await gigaChat.makeRequest(data);
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

function isPipelineCachedPayload(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.supplier != null && typeof o.supplier === "object" && o.customer != null && typeof o.customer === "object";
}

// Функция для определения папки хранения в зависимости от типа файла
const getUploadDir = (mimetype: string) => {
  if (mimetype === "application/pdf") return path.join(__dirname, "../../storage/pdf");
  if (
    [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ].includes(mimetype)
  ) {
    return path.join(__dirname, "../../storage/word");
  }
  if (["image/jpeg", "image/png", "image/webp"].includes(mimetype)) {
    return path.join(__dirname, "../../storage/raster");
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

export async function parseStoredDocumentFile(params: {
  originalName: string;
  storedFileName: string;
  absolutePath: string;
}) {
  const fileExtension = path.extname(params.originalName);
  const fileNameWithoutExtension = path.parse(params.storedFileName).name;

  const fileBytes = await fs.promises.readFile(params.absolutePath);
  const contentSha256Hex = sha256HexOfFileBytes(fileBytes);
  const pipelineCacheKey = buildParsePipelineCacheKey(contentSha256Hex);

  let parsedJson: Awaited<ReturnType<typeof parseFunc>>;
  let pipelineCacheHit = false;

  const cached = await getJson<unknown>(pipelineCacheKey);
  if (cached && isPipelineCachedPayload(cached)) {
    parsedJson = cached as Awaited<ReturnType<typeof parseFunc>>;
    pipelineCacheHit = true;
  } else {
    parsedJson = await parseFunc(fileNameWithoutExtension, fileExtension, params.absolutePath);
    await setJson(pipelineCacheKey, parsedJson, getParsePipelineCacheTtlSeconds());
  }

  const normalizedContentSha256 = sha256HexOfStableJson(parsedJson);
  await setParseNormalizedDataHash(params.storedFileName, normalizedContentSha256);

  return {
    parsedJson,
    normalizedContentSha256,
    contentSha256: contentSha256Hex,
    pipelineCacheHit
  };
}

// Контроллер загрузки файла
export const parseFile = (req: Request, res: Response) => {
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

    try {
      const parsed = await parseStoredDocumentFile({
        originalName: req.file.originalname,
        storedFileName: req.file.filename,
        absolutePath: req.file.path
      });

      res.json({
        message: "Файл загружен",
        filename: req.file.filename,
        path: req.file.path,
        parsedJson: parsed.parsedJson,
        normalizedContentSha256: parsed.normalizedContentSha256,
        contentSha256: parsed.contentSha256,
        pipelineCacheHit: parsed.pipelineCacheHit
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ошибка обработки файла";
      logger.error(`Ошибка parse-file: ${message}`);
      return res.status(500).json({ error: message });
    }
  });
};
