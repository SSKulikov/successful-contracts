import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { ValidatorService } from "../services/ValidatorService";
import prisma from "../prisma";

const validator = new ValidatorService();

export async function saveData(req: Request, res: Response): Promise<void> {
  try {
    const validatedData = validator.validateDataToSave(req.body);
    // const dbData = transformToDbFormat(validatedData);

    await saveToDb(validatedData);

    logger.info("✅ Данные успешно сохранены");
    res.status(201).json({ message: "Данные успешно сохранены" });
  } catch (error) {
    logger.error(`❌ Ошибка записи данных в БД: ${error}`);
    res.status(500).json({
      message: "Ошибка записи данных",
      error: error instanceof Error ? error.message : error,
    });
  }
}

async function saveToDb(data: any) {
  await prisma.$executeRaw`
      INSERT INTO AlternativaGames.contract 
      (supplier_name, supplier_inn, supplier_kpp, supplier_ogrn, supplier_bik, 
      supplier_corr_account, supplier_payment_account, supplier_email, supplier_phone, supplier_address, 
      supplier_bank_name, customer_name, customer_inn, customer_kpp, customer_ogrn, customer_bik, 
      customer_corr_account, customer_payment_account, customer_email, customer_phone, customer_address, 
      customer_bank_name, contract_number, contract_subject, item, contract_sum, contract_currency, 
      contract_date, contract_start_date, 
      contract_end_date, createdAt, updatedAt) 
      VALUES 
      (${data.supplier_name}, ${data.supplier_inn}, ${data.supplier_kpp}, ${data.supplier_ogrn}, ${data.supplier_bik}, 
      ${data.supplier_corr_account}, ${data.supplier_payment_account}, ${data.supplier_email}, ${data.supplier_phone}, ${data.supplier_address}, 
      ${data.supplier_bank_name}, ${data.customer_name}, ${data.customer_inn}, ${data.customer_kpp}, ${data.customer_ogrn}, ${data.customer_bik}, 
      ${data.customer_corr_account}, ${data.customer_payment_account}, ${data.customer_email}, ${data.customer_phone}, ${data.customer_address}, 
      ${data.customer_bank_name}, ${data.contract_number}, ${data.contract_subject}, ${data.item}, ${data.contract_sum}, ${data.contract_currency}, 
      ${data.contract_date}, ${data.contract_start_date}, 
      ${data.contract_end_date}, ${new Date()}, ${new Date()});
    `;
}
