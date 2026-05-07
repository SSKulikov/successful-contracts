import fs from "fs";
import path from "path";
import { Readable } from "stream";
import type {
  PresignedDownloadUrlParams,
  PresignedUploadUrlParams,
  PresignedUploadUrlResult,
  PutObjectParams,
  StorageObjectMetadata,
  StorageObjectRef,
  StorageService
} from "./index";

export class LocalStorageService implements StorageService {
  constructor(private readonly rootDir: string) {}

  async getPresignedUploadUrl(_params: PresignedUploadUrlParams): Promise<PresignedUploadUrlResult> {
    throw new Error("LocalStorageService does not support presigned browser uploads");
  }

  async getPresignedDownloadUrl(_params: PresignedDownloadUrlParams): Promise<string> {
    throw new Error("LocalStorageService does not support presigned browser downloads");
  }

  async headObject(params: StorageObjectRef): Promise<StorageObjectMetadata> {
    const filePath = this.resolveObjectPath(params);
    const stat = await fs.promises.stat(filePath);

    return {
      contentLength: stat.size,
      lastModified: stat.mtime
    };
  }

  async deleteObject(params: StorageObjectRef): Promise<void> {
    await fs.promises.rm(this.resolveObjectPath(params), { force: true });
  }

  async getObjectStream(params: StorageObjectRef): Promise<Readable> {
    return fs.createReadStream(this.resolveObjectPath(params));
  }

  async putObject(params: PutObjectParams): Promise<void> {
    const filePath = this.resolveObjectPath(params);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    if (typeof params.body === "string" || Buffer.isBuffer(params.body) || params.body instanceof Uint8Array) {
      await fs.promises.writeFile(filePath, params.body);
      return;
    }

    const streamBody = params.body as Readable;
    await new Promise<void>((resolve, reject) => {
      streamBody
        .pipe(fs.createWriteStream(filePath))
        .on("finish", resolve)
        .on("error", reject);
    });
  }

  private resolveObjectPath(params: StorageObjectRef): string {
    const root = path.resolve(this.rootDir);
    const objectPath = path.resolve(root, params.bucket, params.key);

    if (!objectPath.startsWith(root + path.sep)) {
      throw new Error("Invalid local storage object path");
    }

    return objectPath;
  }
}
