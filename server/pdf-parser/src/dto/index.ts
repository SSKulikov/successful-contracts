type companyDetails = {
  name: string | null;
  inn: number | null; // ИНН
  kpp: number | null; // КПП
  ogrn: number | null; // ОГРН
  bik: string | null; // БИК
  corr_account: number | null; // Корр. счёт или к/с
  payment_account: number | null; // Платёжный счёт или расчетный счет или Р/с ИМЕННО ЧИСЛО
  email: string | null;
  phone: string | null;
  address: string | null;
  bank_name: string | null; // Название банка
};
export type parsedData = {
  supplier: companyDetails;
  customer: companyDetails;
  contract_type: string | null; // обычно целиком название перед номером
  contract_number: string | null;
  contract_subject: string | null; // Предмет договора
  contract_sum: number | null; // Сумма договора
  contract_currency: string | null; // Валюта оплаты, например RUB/USD/и т д
  payment_1_sum: string | null; // Сумма первого платежа
  payment_1_date: Date | null; // Дата первого платежа
  payment_2_sum: string | null; // Сумма второго платежа - не обязательно что он есть
  payment_2_date: Date | null; // Дата второго платежа - не обязательно что он есть
  contract_date: Date | null; // самая первая дата которую находим (в формате 'YYY-mm-dd'). После города
  contract_start_date: Date | null; // дата начала договора (в формате 'YYY-mm-dd'), обычно дата контракта, если не указано иного
  contract_end_date: Date | null; // дата окончания договора или дедлайн (в формате 'YYY-mm-dd')
  item: string | null; // Статья затрат (вычлени из предмета договора)
};
