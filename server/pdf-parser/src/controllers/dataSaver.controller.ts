import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { ValidatorService } from "../services/ValidatorService";
import prisma from "../prisma";

const validator = new ValidatorService();
export async function saveDataInfo(req: Request, res: Response): Promise<void> {
  try {
    const validatedData = validator.validateDataToSave(req.body);

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
const saveToDb = async (data: any) => {
  return prisma.contract.create({
    data: {
      supplier_inn: `dd`,
      supplier_kpp: `${data.supplier_kpp}`,
      supplier_ogrn: `${data.supplier_ogrn}`,
      supplier_corr_account: `${data.supplier_corr_account}`,
      supplier_payment_account: `${data.supplier_payment_account}`,
      customer_inn: `${data.customer_inn}`,
      customer_kpp: `${data.customer_kpp}`,
      customer_ogrn: `${data.customer_ogrn}`,
      customer_corr_account: `${data.customer_corr_account}`,
      customer_payment_account: `${data.customer_payment_account}`,
      payment_1_date: data.payment_1_date,
      payment_2_date: data.payment_2_date ? data.payment_2_date : null,
      contract_date: data.contract_date,
      contract_start_date: data.contract_start_date,
      contract_end_date: data.contract_end_date,
      ...data,
    },
  });
};
