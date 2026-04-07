export const allRequisitesPrompt =
  "заполни следующий JSON исходя из предоставленных мною данных (спарси, но не придумывай свое. Если результатов для поля нет - отдай null). комментарии не оставляй, буду сразу делать JSON.parse():" +
  "Если не понимаешь по реквизитам, что кому принадлежит, то первое обозначение чего-то в supplier, а второе - в customer" +
  "четко соответствуй типам!" +
  "type companyDetails = {\n" +
  "  name: string | null;\n" +
  "  inn: number | null; // ИНН\n" +
  "  kpp: number | null; // КПП\n" +
  "  ogrn: number | null; // ОГРН\n" +
  "  bik: string | null; // БИК \n" +
  "  corr_account: string | null; // Корр. счёт или к/с\n" +
  "  payment_account: string | null; // Платёжный счёт или расчетный счет или Р/с\n" +
  "  email: string | null;\n" +
  "  phone: string | null;\n" +
  "  address: string | null;\n" +
  "  bank_name: string | null; // Название банка\n" +
  "}\n" +
  "type parsedData = {\n" +
  "  supplier: companyDetails\n" +
  "  customer: companyDetails\n" +
  "  contract_type: string | null // обычно целиком название перед номером до 100 символов \n" +
  "  contract_number: string | null\n" +
  "  contract_subject: string | null // Предмет договора \n" +
  "  contract_sum: number | null // Сумма договора \n" +
  "  contract_currency: string | null // Валюта оплаты, например RUB/USD/и т д \n" +
  "  payment_1_sum: string | null // Сумма первого платежа \n" +
  "  payment_1_date: Date | null // Дата первого платежа \n" +
  "  payment_2_sum: string | null // Сумма второго платежа - не обязательно что он есть \n" +
  "  payment_2_date: Date | null // Дата второго платежа - не обязательно что он есть \n" +
  "  contract_date: Date | null // самая первая дата которую находим (в формате 'YYY-mm-dd'). После города\n" +
  "  contract_start_date: Date | null // дата начала договора (в формате 'YYY-mm-dd'), обычно дата контракта, если не указано иного\n" +
  "  contract_end_date: Date | null // дата окончания договора или дедлайн (в формате 'YYY-mm-dd')\n" +
  "  item: string | null // Статья затрат до 100 символов (вычлени из предмета договора)\n" +
  "  }";
