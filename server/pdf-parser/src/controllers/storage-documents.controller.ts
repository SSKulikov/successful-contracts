import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Request, Response } from "express";
import prisma from "../prisma";
import { getStorageService } from "../services/StorageService/factory";
import { logger } from "../utils/logger";
import { parseStoredDocumentFile } from "./file.controller";

const DEFAULT_MAX_FILE_MB = 30;
const DEFAULT_PARSER_JOB_TIMEOUT_MS = 120000;
const RASTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function getRawBucket(): string {
  const bucket = process.env.S3_BUCKET_RAW?.trim();
  if (!bucket) {
    throw new Error("Missing required env var: S3_BUCKET_RAW");
  }
  return bucket;
}

function getProcessedBucket(): string {
  const bucket = process.env.S3_BUCKET_PROCESSED?.trim();
  if (!bucket) {
    throw new Error("Missing required env var: S3_BUCKET_PROCESSED");
  }
  return bucket;
}

function getMaxFileBytes(): number {
  const raw = process.env.PARSER_MAX_FILE_MB?.trim();
  const maxMb = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_FILE_MB;
  return (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : DEFAULT_MAX_FILE_MB) * 1024 * 1024;
}

function getParserJobTimeoutMs(): number {
  const raw = process.env.PARSER_JOB_TIMEOUT_MS?.trim();
  const timeoutMs = raw ? Number.parseInt(raw, 10) : DEFAULT_PARSER_JOB_TIMEOUT_MS;
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_PARSER_JOB_TIMEOUT_MS;
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_");
  return base || "document";
}

function buildObjectKey(ownerId: number, documentId: string, fileName: string): string {
  return `documents/${ownerId}/${documentId}/${sanitizeFileName(fileName)}`;
}

function contentDispositionAttachment(fileName: string): string {
  const safeName = String(fileName || "document").replace(/[\u0000-\u001F\u007F]+/g, "_");
  const fallbackName = safeName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\;]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "document";
  return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

function resolveParserStorageDir(originalName: string, mimeType: string): string {
  const ext = path.extname(originalName).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") {
    return path.resolve(process.cwd(), "storage", "pdf");
  }

  if (
    ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(mimeType) ||
    ext === ".doc" ||
    ext === ".docx"
  ) {
    return path.resolve(process.cwd(), "storage", "word");
  }

  if (mimeType.startsWith("image/") || RASTER_EXTENSIONS.has(ext)) {
    return path.resolve(process.cwd(), "storage", "raster");
  }

  throw new Error(`Неподдерживаемый формат файла: ${mimeType || ext}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Таймаут обработки документа ${timeoutMs} мс`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function processDocumentFromStorage(document: {
  id: string;
  ownerId: number;
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
}) {
  const storage = getStorageService();
  const ext = path.extname(document.originalName).toLowerCase();
  const storedFileName = `${document.id}${ext}`;
  const parserDir = resolveParserStorageDir(document.originalName, document.mimeType);
  const localPath = path.join(parserDir, storedFileName);

  await fs.promises.mkdir(parserDir, { recursive: true });
  await pipeline(
    await storage.getObjectStream({
      bucket: document.bucket,
      key: document.objectKey
    }),
    fs.createWriteStream(localPath)
  );

  const parsed = await parseStoredDocumentFile({
    originalName: document.originalName,
    storedFileName,
    absolutePath: localPath
  });

  const processedBucket = getProcessedBucket();
  const processedObjectKey = `documents/${document.ownerId}/${document.id}/parsed.json`;
  const resultBody = JSON.stringify(
    {
      documentId: document.id,
      parsedJson: parsed.parsedJson,
      normalizedContentSha256: parsed.normalizedContentSha256,
      contentSha256: parsed.contentSha256,
      pipelineCacheHit: parsed.pipelineCacheHit,
      extractedAt: new Date().toISOString()
    },
    null,
    2
  );

  await storage.putObject({
    bucket: processedBucket,
    key: processedObjectKey,
    body: resultBody,
    contentType: "application/json; charset=utf-8",
    contentLength: Buffer.byteLength(resultBody)
  });

  return {
    parsed,
    processedBucket,
    processedObjectKey,
    resultBody
  };
}

export async function createDocumentUploadUrl(req: Request, res: Response): Promise<void> {
  try {
    const owner = req.authEmployee;
    if (!owner) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

    const fileName = String(req.body?.fileName ?? "").trim();
    const mimeType = String(req.body?.mimeType ?? "").trim();
    const sizeBytes = Number(req.body?.sizeBytes);

    if (!fileName || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      res.status(400).json({ message: "Поля fileName, mimeType и sizeBytes обязательны" });
      return;
    }

    if (sizeBytes > getMaxFileBytes()) {
      res.status(413).json({ message: "Файл превышает допустимый размер" });
      return;
    }

    const documentId = randomUUID();
    const bucket = getRawBucket();
    const objectKey = buildObjectKey(owner.id, documentId, fileName);
    const storage = getStorageService();

    const upload = await storage.getPresignedUploadUrl({
      bucket,
      key: objectKey,
      contentType: mimeType,
      contentLength: sizeBytes
    });

    await prisma.document.create({
      data: {
        id: documentId,
        ownerId: owner.id,
        storageProvider: process.env.STORAGE_PROVIDER === "local" ? "local" : "s3",
        bucket,
        objectKey,
        originalName: fileName,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        processingStatus: "uploaded"
      }
    });

    res.status(201).json({
      documentId,
      objectKey,
      uploadUrl: upload.url,
      headers: upload.headers
    });
  } catch (error) {
    logger.error(`❌ Ошибка создания URL загрузки документа: ${error}`);
    res.status(500).json({ message: "Не удалось создать URL загрузки" });
  }
}

export async function completeDocumentUpload(req: Request, res: Response): Promise<void> {
  try {
    const owner = req.authEmployee;
    if (!owner) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        ownerId: owner.id
      }
    });

    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    if (document.processingStatus === "processing" || document.processingStatus === "done" || document.processingStatus === "failed") {
      res.json({
        documentId: document.id,
        processingStatus: document.processingStatus,
        processingError: document.processingError
      });
      return;
    }

    const storage = getStorageService();
    const metadata = await storage.headObject({
      bucket: document.bucket,
      key: document.objectKey
    });

    if (metadata.contentLength != null && BigInt(metadata.contentLength) !== document.sizeBytes) {
      res.status(409).json({ message: "Размер загруженного файла не совпадает с ожидаемым" });
      return;
    }

    if (document.sizeBytes > BigInt(getMaxFileBytes())) {
      res.status(413).json({ message: "Файл превышает допустимый размер" });
      return;
    }

    if (metadata.contentType && metadata.contentType !== document.mimeType) {
      res.status(409).json({ message: "MIME type загруженного файла не совпадает с ожидаемым" });
      return;
    }

    const claim = await prisma.document.updateMany({
      where: {
        id: document.id,
        ownerId: owner.id,
        processingStatus: "uploaded"
      },
      data: {
        processingStatus: "processing",
        processingError: null
      }
    });

    if (claim.count === 0) {
      const current = await prisma.document.findFirst({
        where: {
          id: document.id,
          ownerId: owner.id
        }
      });

      res.json({
        documentId: document.id,
        processingStatus: current?.processingStatus ?? document.processingStatus,
        processingError: current?.processingError ?? document.processingError
      });
      return;
    }

    try {
      const processed = await withTimeout(processDocumentFromStorage(document), getParserJobTimeoutMs());

      await prisma.documentContent.upsert({
        where: {
          documentId_version: {
            documentId: document.id,
            version: 1
          }
        },
        create: {
          documentId: document.id,
          version: 1,
          textContent: processed.resultBody,
          processedBucket: processed.processedBucket,
          processedObjectKey: processed.processedObjectKey
        },
        update: {
          textContent: processed.resultBody,
          processedBucket: processed.processedBucket,
          processedObjectKey: processed.processedObjectKey,
          extractedAt: new Date()
        }
      });

      const updated = await prisma.document.update({
        where: { id: document.id },
        data: {
          processingStatus: "done",
          processingError: null,
          checksumSha256: processed.parsed.contentSha256
        }
      });

      res.json({
        documentId: updated.id,
        processingStatus: updated.processingStatus,
        processingError: updated.processingError
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка обработки документа";
      const failed = await prisma.document.update({
        where: { id: document.id },
        data: {
          processingStatus: "failed",
          processingError: message
        }
      });

      logger.error(`❌ Ошибка обработки документа ${document.id}: ${message}`);
      res.status(500).json({
        documentId: failed.id,
        processingStatus: failed.processingStatus,
        processingError: failed.processingError
      });
      return;
    }

  } catch (error) {
    logger.error(`❌ Ошибка подтверждения загрузки документа: ${error}`);
    res.status(500).json({ message: "Не удалось подтвердить загрузку" });
  }
}

export async function getDocumentProcessingStatus(req: Request, res: Response): Promise<void> {
  try {
    const owner = req.authEmployee;
    if (!owner) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        ownerId: owner.id
      },
      select: {
        id: true,
        processingStatus: true,
        processingError: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    res.json({
      documentId: document.id,
      processingStatus: document.processingStatus,
      processingError: document.processingError,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt
    });
  } catch (error) {
    logger.error(`❌ Ошибка получения статуса документа: ${error}`);
    res.status(500).json({ message: "Не удалось получить статус документа" });
  }
}

export async function getDocumentDownloadUrl(req: Request, res: Response): Promise<void> {
  try {
    const owner = req.authEmployee;
    if (!owner) {
      res.status(401).json({ message: "Сессия не найдена" });
      return;
    }

    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        ownerId: owner.id
      }
    });

    if (!document) {
      res.status(404).json({ message: "Документ не найден" });
      return;
    }

    const variant = String(req.query.variant ?? "original");
    const storage = getStorageService();

    if (variant === "processed") {
      const content = await prisma.documentContent.findFirst({
        where: { documentId: document.id },
        orderBy: { version: "desc" }
      });

      if (!content?.processedBucket || !content.processedObjectKey) {
        res.status(404).json({ message: "Результат обработки еще не сохранен в Object Storage" });
        return;
      }

      const downloadUrl = await storage.getPresignedDownloadUrl({
        bucket: content.processedBucket,
        key: content.processedObjectKey,
        responseContentDisposition: contentDispositionAttachment(`${document.originalName}.processed`)
      });

      res.json({
        documentId: document.id,
        variant,
        downloadUrl
      });
      return;
    }

    if (variant !== "original") {
      res.status(400).json({ message: "variant должен быть original или processed" });
      return;
    }

    const downloadUrl = await storage.getPresignedDownloadUrl({
      bucket: document.bucket,
      key: document.objectKey,
      responseContentDisposition: contentDispositionAttachment(document.originalName)
    });

    res.json({
      documentId: document.id,
      variant,
      downloadUrl
    });
  } catch (error) {
    logger.error(`❌ Ошибка создания URL скачивания документа: ${error}`);
    res.status(500).json({ message: "Не удалось создать URL скачивания" });
  }
}
