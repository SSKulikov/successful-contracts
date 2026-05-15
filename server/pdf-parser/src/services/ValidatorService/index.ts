export class ValidatorService {
  private validateString(value: any) {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private validateNumber(value: any) {
    if (value === null || value === undefined || value === "") return null;

    if (typeof value === "number" && !isNaN(value)) {
      return value; // Оставляем число как есть
    }

    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
      return parseFloat(value.trim()); // Преобразуем строку в число
    }

    return null;
  }

  private validateEmail(value: any) {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof value === "string" && emailRegex.test(value.trim())
      ? value.trim()
      : null;
  }

  private validatePhone(value: any) {
    if (!value) return null;
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    return typeof value === "string" && phoneRegex.test(value.trim())
      ? value.trim()
      : null;
  }

  private validateNullableString(value: any) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    if (!normalized || normalized.toLowerCase() === "null" || normalized.toLowerCase() === "undefined") {
      return null;
    }
    return normalized;
  }

  private validateDate(value: any) {
    if (!value) return null;
    const date = new Date(value);
    return !isNaN(date.getTime()) ? date.toISOString().split("T")[0] : null;
  }

  private validateCompanyDetails(company: any) {
    return company
      ? {
          name: this.validateString(company.name),
          inn: this.validateNumber(company.inn),
          kpp: this.validateNumber(company.kpp),
          ogrn: this.validateNumber(company.ogrn),
          bik: this.validateNullableString(company.bik),
          corr_account: this.validateNullableString(company.corr_account),
          payment_account: this.validateNullableString(company.payment_account),
          email: this.validateEmail(company.email),
          phone: this.validatePhone(company.phone),
          address: this.validateString(company.address),
          bank_name: this.validateString(company.bank_name),
        }
      : null;
  }

  public validateParsedData(data: any) {
    return {
      supplier: this.validateCompanyDetails(data?.supplier),
      customer: this.validateCompanyDetails(data?.customer),
      contract_type: this.validateString(data?.contract_type),
      contract_number: this.validateString(data?.contract_number),
      contract_subject: this.validateString(data?.contract_subject),
      contract_sum: this.validateNumber(data?.contract_sum),
      contract_currency: this.validateString(data?.contract_currency),
      payment_1_sum: this.validateNumber(data?.payment_1_sum),
      payment_1_date: this.validateDate(data?.payment_1_date),
      payment_2_sum: this.validateNumber(data?.payment_2_sum),
      payment_2_date: this.validateDate(data?.payment_2_date),
      contract_date: this.validateDate(data?.contract_date),
      contract_start_date: this.validateDate(data?.contract_start_date),
      contract_end_date: this.validateDate(data?.contract_end_date),
      item: this.validateString(data?.item),
    };
  }

  public validateDataToSave(data: any) {
    return {
      contract_type: this.validateString(data.contract_type),
      contract_number: this.validateString(data.contract_number),
      contract_subject: this.validateString(data.contract_subject),
      item: this.validateString(data.item),
      contract_sum: this.validateNumber(data.contract_sum),
      contract_currency: this.validateString(data.contract_currency),
      payment_1_sum: this.validateNumber(data.payment_1_sum),
      payment_1_date: this.validateDate(data.payment_1_date),
      payment_2_sum: this.validateNumber(data.payment_2_sum),
      payment_2_date: this.validateDate(data.payment_2_date),
      contract_date: this.validateDate(data.contract_date),
      contract_start_date: this.validateDate(data.contract_start_date),
      contract_end_date: this.validateDate(data.contract_end_date),
      supplier_name: this.validateString(data.supplier_name),
      supplier_inn: this.validateNumber(data.supplier_inn),
      supplier_kpp: this.validateNumber(data.supplier_kpp),
      supplier_ogrn: this.validateNumber(data.supplier_ogrn),
      supplier_bik: this.validateNullableString(data.supplier_bik),
      supplier_corr_account: this.validateNullableString(data.supplier_corr_account),
      supplier_payment_account: this.validateNullableString(data.supplier_payment_account),
      supplier_email: this.validateEmail(data.supplier_email),
      supplier_phone: this.validatePhone(data.supplier_phone),
      supplier_address: this.validateString(data.supplier_address),
      supplier_bank_name: this.validateString(data.supplier_bank_name),
      customer_name: this.validateString(data.customer_name),
      customer_inn: this.validateNumber(data.customer_inn),
      customer_kpp: this.validateNumber(data.customer_kpp),
      customer_ogrn: this.validateNumber(data.customer_ogrn),
      customer_bik: this.validateNullableString(data.customer_bik),
      customer_corr_account: this.validateNullableString(data.customer_corr_account),
      customer_payment_account: this.validateNullableString(data.customer_payment_account),
      customer_email: this.validateEmail(data.customer_email),
      customer_phone: this.validatePhone(data.customer_phone),
      customer_address: this.validateString(data.customer_address),
      customer_bank_name: this.validateString(data.customer_bank_name),
    };
  }
}
