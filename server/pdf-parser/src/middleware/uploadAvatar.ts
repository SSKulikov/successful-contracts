import fs from "fs";
import path from "path";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

const MAX_BYTES = Math.max(1024, Number(process.env.AVATAR_MAX_BYTES ?? 2 * 1024 * 1024));
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function getAvatarsRoot(): string {
  return path.resolve(process.cwd(), "uploads", "avatars");
}

export function ensureAvatarsDir(): void {
  fs.mkdirSync(getAvatarsRoot(), { recursive: true });
}

function extFromMime(mimetype: string): string {
  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/png") return ".png";
  if (mimetype === "image/webp") return ".webp";
  return ".bin";
}

export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureAvatarsDir();
      cb(null, getAvatarsRoot());
    },
    filename: (req, file, cb) => {
      const emp = (req as Request & { authEmployee?: { id: number } }).authEmployee;
      const id = emp?.id ?? 0;
      cb(null, `av-${id}-${Date.now()}${extFromMime(file.mimetype)}`);
    }
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Допустимы только изображения JPEG, PNG или WebP"));
  }
});

export function handleAvatarUpload(req: Request, res: Response, next: NextFunction): void {
  avatarUpload.single("avatar")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "Файл слишком большой" });
      return;
    }
    const msg = err instanceof Error ? err.message : "Ошибка загрузки файла";
    res.status(400).json({ message: msg });
  });
}
