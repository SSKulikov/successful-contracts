-- Soft delete сотрудников: метка времени удаления (NULL — активная учётная запись).

SET @dbn = DATABASE();

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'deleted_at') > 0,
  'SELECT 1',
  'ALTER TABLE `employees` ADD COLUMN `deleted_at` DATETIME(3) NULL'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND INDEX_NAME = 'employees_deleted_at_idx') > 0,
  'SELECT 1',
  'CREATE INDEX `employees_deleted_at_idx` ON `employees`(`deleted_at`)'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;
