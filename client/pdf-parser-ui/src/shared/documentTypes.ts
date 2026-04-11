/**
 * Единый набор значений поля `type` документа согласования (как в API/БД).
 * Использовать во всех селектах: фильтры «Мои документы» / «В работе», форма создания.
 */
export const DOCUMENT_TYPE_VALUES = ["Договор", "УПД", "Счет на оплату", "Акт", "Накладная"] as const;

export type DocumentTypeValue = (typeof DOCUMENT_TYPE_VALUES)[number];

export const DOCUMENT_TYPE_SELECT_OPTIONS: { value: DocumentTypeValue; label: string }[] = DOCUMENT_TYPE_VALUES.map(
  (value) => ({ value, label: value })
);
