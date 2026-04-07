/*
  Warnings:

  - You are about to drop the column `contract_type` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `payment_1_date` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `payment_1_sum` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `payment_2_date` on the `contract` table. All the data in the column will be lost.
  - You are about to drop the column `payment_2_sum` on the `contract` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `contract` DROP COLUMN `contract_type`,
    DROP COLUMN `payment_1_date`,
    DROP COLUMN `payment_1_sum`,
    DROP COLUMN `payment_2_date`,
    DROP COLUMN `payment_2_sum`;
