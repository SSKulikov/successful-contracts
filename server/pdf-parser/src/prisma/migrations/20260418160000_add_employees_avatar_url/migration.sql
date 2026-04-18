-- Публичный URL аватара собирается на клиенте/сервере из имени файла в `uploads/avatars` (см. POST /api/users/me/avatar).

SET @dbn = DATABASE();

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbn AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'avatar_url') > 0,
  'SELECT 1',
  'ALTER TABLE `employees` ADD COLUMN `avatar_url` VARCHAR(512) NULL'
));
PREPARE `alterIfNotExists` FROM @preparedStatement;
EXECUTE `alterIfNotExists`;
DEALLOCATE PREPARE `alterIfNotExists`;
