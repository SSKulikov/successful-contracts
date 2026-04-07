import { useRef, useState } from "react";
import axios from "axios";
import { Button, Card, Flex, Spin, Typography, message } from "antd";

type ContractFormValues = {
  contract_number: string;
  contract_subject: string;
  item: string;
  contract_sum: string;
  contract_currency: string;
  contract_date: string;
  contract_start_date: string;
  contract_end_date: string;
  supplier_name: string;
  supplier_inn: string;
  supplier_kpp: string;
  supplier_ogrn: string;
  supplier_bik: string;
  supplier_corr_account: string;
  supplier_payment_account: string;
  supplier_email: string;
  supplier_phone: string;
  supplier_address: string;
  supplier_bank_name: string;
  customer_name: string;
  customer_inn: string;
  customer_kpp: string;
  customer_ogrn: string;
  customer_bik: string;
  customer_corr_account: string;
  customer_payment_account: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  customer_bank_name: string;
};

const initialValues: ContractFormValues = {
  contract_number: "",
  contract_subject: "",
  item: "",
  contract_sum: "",
  contract_currency: "",
  contract_date: "",
  contract_start_date: "",
  contract_end_date: "",
  supplier_name: "",
  supplier_inn: "",
  supplier_kpp: "",
  supplier_ogrn: "",
  supplier_bik: "",
  supplier_corr_account: "",
  supplier_payment_account: "",
  supplier_email: "",
  supplier_phone: "",
  supplier_address: "",
  supplier_bank_name: "",
  customer_name: "",
  customer_inn: "",
  customer_kpp: "",
  customer_ogrn: "",
  customer_bik: "",
  customer_corr_account: "",
  customer_payment_account: "",
  customer_email: "",
  customer_phone: "",
  customer_address: "",
  customer_bank_name: ""
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3003/api";

export function ContractsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formValues, setFormValues] = useState<ContractFormValues>(initialValues);
  const [loading, setLoading] = useState(false);

  const onChangeField = (key: keyof ContractFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const fillFromParsedJson = (parsedJson: any) => {
    setFormValues((prev) => ({
      ...prev,
      supplier_name: parsedJson?.supplier?.name ?? prev.supplier_name,
      supplier_inn: parsedJson?.supplier?.inn ?? prev.supplier_inn,
      supplier_kpp: parsedJson?.supplier?.kpp ?? prev.supplier_kpp,
      supplier_ogrn: parsedJson?.supplier?.ogrn ?? prev.supplier_ogrn,
      supplier_bik: parsedJson?.supplier?.bik ?? prev.supplier_bik,
      supplier_corr_account: parsedJson?.supplier?.corr_account ?? prev.supplier_corr_account,
      supplier_payment_account: parsedJson?.supplier?.payment_account ?? prev.supplier_payment_account,
      supplier_email: parsedJson?.supplier?.email ?? prev.supplier_email,
      supplier_phone: parsedJson?.supplier?.phone ?? prev.supplier_phone,
      supplier_address: parsedJson?.supplier?.address ?? prev.supplier_address,
      supplier_bank_name: parsedJson?.supplier?.bank_name ?? prev.supplier_bank_name,
      customer_name: parsedJson?.customer?.name ?? prev.customer_name,
      customer_inn: parsedJson?.customer?.inn ?? prev.customer_inn,
      customer_kpp: parsedJson?.customer?.kpp ?? prev.customer_kpp,
      customer_ogrn: parsedJson?.customer?.ogrn ?? prev.customer_ogrn,
      customer_bik: parsedJson?.customer?.bik ?? prev.customer_bik,
      customer_corr_account: parsedJson?.customer?.corr_account ?? prev.customer_corr_account,
      customer_payment_account: parsedJson?.customer?.payment_account ?? prev.customer_payment_account,
      customer_email: parsedJson?.customer?.email ?? prev.customer_email,
      customer_phone: parsedJson?.customer?.phone ?? prev.customer_phone,
      customer_address: parsedJson?.customer?.address ?? prev.customer_address,
      customer_bank_name: parsedJson?.customer?.bank_name ?? prev.customer_bank_name,
      contract_number: parsedJson?.contract_number ?? prev.contract_number,
      contract_subject: parsedJson?.contract_subject ?? prev.contract_subject,
      contract_sum: parsedJson?.contract_sum ?? prev.contract_sum,
      contract_currency: parsedJson?.contract_currency ?? prev.contract_currency,
      contract_date: parsedJson?.contract_date ?? prev.contract_date,
      contract_start_date: parsedJson?.contract_start_date ?? prev.contract_start_date,
      contract_end_date: parsedJson?.contract_end_date ?? prev.contract_end_date,
      item: parsedJson?.item ?? prev.item
    }));
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (!allowedTypes.includes(file.type)) {
      message.error("Можно загружать только PDF или Word-документы (.pdf, .doc, .docx)");
      event.target.value = "";
      return;
    }

    const payload = new FormData();
    payload.append("file", file);

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/parse-file`, payload, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      fillFromParsedJson(response.data?.parsedJson);
      message.success("Документ загружен и данные автозаполнены");
    } catch {
      message.error("Не удалось распознать файл");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/save-data-info`, formValues, {
        headers: { "Content-Type": "application/json" }
      });
      message.success("Данные успешно сохранены");
      setFormValues(initialValues);
    } catch {
      message.error("Ошибка сохранения данных");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Typography.Title level={3}>Загрузка договоров</Typography.Title>
      <Spin spinning={loading}>
      <form className="contracts-form" onSubmit={handleSubmit}>
        <h4>Договор</h4>

        <Flex gap={12} style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={handlePickFile}>
            Выбрать файл для автозаполнения
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden-file-input"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </Flex>

        <div className="form-group">
          <label htmlFor="contract_number">Номер договора:</label>
          <input type="text" id="contract_number" value={formValues.contract_number} onChange={(e) => onChangeField("contract_number", e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="contract_subject">Предмет договора:</label>
          <input type="text" id="contract_subject" value={formValues.contract_subject} onChange={(e) => onChangeField("contract_subject", e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="item">Статья расходов:</label>
          <input type="text" id="item" value={formValues.item} onChange={(e) => onChangeField("item", e.target.value)} />
        </div>
        <div className="double-block">
          <div className="form-group">
            <label htmlFor="contract_sum">Сумма договора:</label>
            <input type="text" id="contract_sum" value={formValues.contract_sum} onChange={(e) => onChangeField("contract_sum", e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="contract_currency">Валюта оплаты:</label>
            <input type="text" id="contract_currency" value={formValues.contract_currency} onChange={(e) => onChangeField("contract_currency", e.target.value)} />
          </div>
        </div>

        <div className="double-block three-col">
          <div className="form-group">
            <label htmlFor="contract_date">Дата договора:</label>
            <input type="date" id="contract_date" value={formValues.contract_date} onChange={(e) => onChangeField("contract_date", e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="contract_start_date">Дата начала договора:</label>
            <input type="date" id="contract_start_date" value={formValues.contract_start_date} onChange={(e) => onChangeField("contract_start_date", e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="contract_end_date">Дата окончания договора:</label>
            <input type="date" id="contract_end_date" value={formValues.contract_end_date} onChange={(e) => onChangeField("contract_end_date", e.target.value)} />
          </div>
        </div>

        <h4>Реквизиты сторон</h4>
        <div className="parties-agreement">
          <div className="party-card">
            <h5>Поставщик</h5>
            <div className="form-group"><label htmlFor="supplier_name">Название компании:</label><input type="text" id="supplier_name" value={formValues.supplier_name} onChange={(e) => onChangeField("supplier_name", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_inn">ИНН:</label><input type="number" id="supplier_inn" value={formValues.supplier_inn} onChange={(e) => onChangeField("supplier_inn", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_kpp">КПП:</label><input type="number" id="supplier_kpp" value={formValues.supplier_kpp} onChange={(e) => onChangeField("supplier_kpp", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_ogrn">ОГРН:</label><input type="number" id="supplier_ogrn" value={formValues.supplier_ogrn} onChange={(e) => onChangeField("supplier_ogrn", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_bik">БИК:</label><input type="text" id="supplier_bik" value={formValues.supplier_bik} onChange={(e) => onChangeField("supplier_bik", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_corr_account">Корр. счёт:</label><input type="text" id="supplier_corr_account" value={formValues.supplier_corr_account} onChange={(e) => onChangeField("supplier_corr_account", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_payment_account">Платёжный счёт:</label><input type="text" id="supplier_payment_account" value={formValues.supplier_payment_account} onChange={(e) => onChangeField("supplier_payment_account", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_email">Email:</label><input type="text" id="supplier_email" value={formValues.supplier_email} onChange={(e) => onChangeField("supplier_email", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_phone">Телефон:</label><input type="text" id="supplier_phone" value={formValues.supplier_phone} onChange={(e) => onChangeField("supplier_phone", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_address">Адрес:</label><input type="text" id="supplier_address" value={formValues.supplier_address} onChange={(e) => onChangeField("supplier_address", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="supplier_bank_name">Название банка:</label><input type="text" id="supplier_bank_name" value={formValues.supplier_bank_name} onChange={(e) => onChangeField("supplier_bank_name", e.target.value)} /></div>
          </div>
          <div className="party-card">
            <h5>Заказчик</h5>
            <div className="form-group"><label htmlFor="customer_name">Название компании:</label><input type="text" id="customer_name" value={formValues.customer_name} onChange={(e) => onChangeField("customer_name", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_inn">ИНН:</label><input type="number" id="customer_inn" value={formValues.customer_inn} onChange={(e) => onChangeField("customer_inn", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_kpp">КПП:</label><input type="number" id="customer_kpp" value={formValues.customer_kpp} onChange={(e) => onChangeField("customer_kpp", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_ogrn">ОГРН:</label><input type="number" id="customer_ogrn" value={formValues.customer_ogrn} onChange={(e) => onChangeField("customer_ogrn", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_bik">БИК:</label><input type="text" id="customer_bik" value={formValues.customer_bik} onChange={(e) => onChangeField("customer_bik", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_corr_account">Корр. счёт:</label><input type="text" id="customer_corr_account" value={formValues.customer_corr_account} onChange={(e) => onChangeField("customer_corr_account", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_payment_account">Платёжный счёт:</label><input type="text" id="customer_payment_account" value={formValues.customer_payment_account} onChange={(e) => onChangeField("customer_payment_account", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_email">Email:</label><input type="text" id="customer_email" value={formValues.customer_email} onChange={(e) => onChangeField("customer_email", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_phone">Телефон:</label><input type="text" id="customer_phone" value={formValues.customer_phone} onChange={(e) => onChangeField("customer_phone", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_address">Адрес:</label><input type="text" id="customer_address" value={formValues.customer_address} onChange={(e) => onChangeField("customer_address", e.target.value)} /></div>
            <div className="form-group"><label htmlFor="customer_bank_name">Название банка:</label><input type="text" id="customer_bank_name" value={formValues.customer_bank_name} onChange={(e) => onChangeField("customer_bank_name", e.target.value)} /></div>
          </div>
        </div>

        <Button type="primary" htmlType="submit" style={{ marginTop: 12 }}>
          Отправить
        </Button>
      </form>
      </Spin>
    </Card>
  );
}
