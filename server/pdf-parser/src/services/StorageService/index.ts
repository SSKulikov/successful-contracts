import type { Readable } from "stream";

export type StorageProvider = "s3" | "local";

export type StorageObjectRef = {
  bucket: string;
  key: string;
};

export type PresignedUploadUrlParams = StorageObjectRef & {
  contentType: string;
  contentLength?: number;
  expiresInSeconds?: number;
};

export type PresignedUploadUrlResult = {
  url: string;
  headers: Record<string, string>;
};

export type PresignedDownloadUrlParams = StorageObjectRef & {
  expiresInSeconds?: number;
  responseContentDisposition?: string;
};

export type StorageObjectMetadata = {
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
};

export type PutObjectParams = StorageObjectRef & {
  body: Buffer | Uint8Array | string | Readable;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
};

export interface StorageService {
  getPresignedUploadUrl(params: PresignedUploadUrlParams): Promise<PresignedUploadUrlResult>;
  getPresignedDownloadUrl(params: PresignedDownloadUrlParams): Promise<string>;
  headObject(params: StorageObjectRef): Promise<StorageObjectMetadata>;
  deleteObject(params: StorageObjectRef): Promise<void>;
  getObjectStream(params: StorageObjectRef): Promise<Readable>;
  putObject(params: PutObjectParams): Promise<void>;
}
