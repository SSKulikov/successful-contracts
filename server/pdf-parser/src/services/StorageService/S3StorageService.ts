import { Readable } from "stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  PresignedDownloadUrlParams,
  PresignedUploadUrlParams,
  PresignedUploadUrlResult,
  PutObjectParams,
  StorageObjectMetadata,
  StorageObjectRef,
  StorageService
} from "./index";

export type S3StorageServiceConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  defaultUploadTtlSeconds: number;
  defaultDownloadTtlSeconds: number;
};

export class S3StorageService implements StorageService {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageServiceConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async getPresignedUploadUrl(params: PresignedUploadUrlParams): Promise<PresignedUploadUrlResult> {
    const command = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds ?? this.config.defaultUploadTtlSeconds
    });

    return {
      url,
      headers: {
        "Content-Type": params.contentType
      }
    };
  }

  async getPresignedDownloadUrl(params: PresignedDownloadUrlParams): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ResponseContentDisposition: params.responseContentDisposition
    });

    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresInSeconds ?? this.config.defaultDownloadTtlSeconds
    });
  }

  async headObject(params: StorageObjectRef): Promise<StorageObjectMetadata> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: params.bucket,
        Key: params.key
      })
    );

    return {
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      etag: response.ETag,
      lastModified: response.LastModified,
      metadata: response.Metadata
    };
  }

  async deleteObject(params: StorageObjectRef): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key
      })
    );
  }

  async getObjectStream(params: StorageObjectRef): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key
      })
    );

    if (!(response.Body instanceof Readable)) {
      throw new Error("S3 object body is not a readable Node stream");
    }

    return response.Body;
  }

  async putObject(params: PutObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
        Metadata: params.metadata
      })
    );
  }
}
