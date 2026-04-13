-- Таблицы companies, employees (с company_id), auth_sessions и внешние ключи.
-- Идемпотентно для БД, где employees уже создавался runtime-кодом без company_id.

CREATE TABLE IF NOT EXISTS `companies` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `inn` VARCHAR(32) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX `uq_companies_inn`(`inn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employees` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `full_name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `position` VARCHAR(255) NOT NULL,
    `roles_json` TEXT NOT NULL,
    `password_value` VARCHAR(255) NOT NULL,
    `is_temporary_password` TINYINT(1) NOT NULL DEFAULT 1,
    `status` VARCHAR(32) NOT NULL DEFAULT 'Активен',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `company_id` INT NULL,
    UNIQUE INDEX `employees_email_key`(`email`),
    INDEX `employees_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Legacy: колонки, которых не было в самых ранних версиях employees
SET @dbn = DATABASE();

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'password_value') > 0,
  'SELECT 1',
  'ALTER TABLE `employees` ADD COLUMN `password_value` VARCHAR(255) NOT NULL DEFAULT \'\''
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'is_temporary_password') > 0,
  'SELECT 1',
  'ALTER TABLE `employees` ADD COLUMN `is_temporary_password` TINYINT(1) NOT NULL DEFAULT 1'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'company_id') > 0,
  'SELECT 1',
  'ALTER TABLE `employees` ADD COLUMN `company_id` INT NULL'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND INDEX_NAME = 'employees_company_id_idx') > 0,
  'SELECT 1',
  'CREATE INDEX `employees_company_id_idx` ON `employees`(`company_id`)'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND CONSTRAINT_NAME = 'fk_employees_company') > 0,
  'SELECT 1',
  'ALTER TABLE `employees` ADD CONSTRAINT `fk_employees_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
    `token` VARCHAR(255) NOT NULL,
    `employee_id` INT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`token`),
    INDEX `auth_sessions_employee_id_idx`(`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @dbn AND TABLE_NAME = 'auth_sessions' AND CONSTRAINT_NAME = 'fk_auth_sessions_employee') > 0,
  'SELECT 1',
  'ALTER TABLE `auth_sessions` ADD CONSTRAINT `fk_auth_sessions_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;
