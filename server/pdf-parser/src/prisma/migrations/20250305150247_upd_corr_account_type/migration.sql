/*
  Warnings:

  - You are about to alter the column `supplier_corr_account` on the `contract` table. The data in that column could be lost. The data in that column will be cast from `UnsignedBigInt` to `VarChar(191)`.
  - You are about to alter the column `customer_corr_account` on the `contract` table. The data in that column could be lost. The data in that column will be cast from `UnsignedBigInt` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `contract` MODIFY `supplier_corr_account` VARCHAR(191) NULL,
    MODIFY `customer_corr_account` VARCHAR(191) NULL;
