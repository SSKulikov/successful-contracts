-- Документы, загруженные во внешнее S3-хранилище, и результаты обработки.

CREATE TABLE IF NOT EXISTS `documents` (
    `id` CHAR(36) NOT NULL,
    `owner_id` INT NOT NULL,
    `storage_provider` VARCHAR(16) NOT NULL DEFAULT 's3',
    `bucket` VARCHAR(255) NOT NULL,
    `object_key` VARCHAR(768) NOT NULL,
    `original_name` VARCHAR(512) NOT NULL,
    `mime_type` VARCHAR(255) NOT NULL,
    `size_bytes` BIGINT UNSIGNED NOT NULL,
    `checksum_sha256` CHAR(64) NULL,
    `processing_status` ENUM('uploaded', 'processing', 'done', 'failed') NOT NULL DEFAULT 'uploaded',
    `processing_error` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `documents_object_key_key` (`object_key`),
    INDEX `documents_processing_status_created_at_idx` (`processing_status`, `created_at`),
    INDEX `documents_owner_id_created_at_idx` (`owner_id`, `created_at`),
    CONSTRAINT `documents_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `document_contents` (
    `document_id` CHAR(36) NOT NULL,
    `version` INT NOT NULL DEFAULT 1,
    `text_content` LONGTEXT NULL,
    `processed_bucket` VARCHAR(255) NULL,
    `processed_object_key` VARCHAR(1024) NULL,
    `extracted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`document_id`, `version`),
    CONSTRAINT `document_contents_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
