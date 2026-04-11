import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MockApiBanner } from "../shared/components/MockApiBanner";
import { getApiErrorMessage } from "../shared/utils/api-error";
import { contractsApi, DocumentFormPayload, DocumentRow, documentsApi, type ListMyDocumentsParams } from "../shared/api";
import { DOCUMENT_TYPE_SELECT_OPTIONS } from "../shared/documentTypes";
import { MyDocumentsStatusSummary } from "./MyDocumentsStatusSummary";

function renderStatusTag(status: DocumentRow["status"]) {
  if (status === "Загружен") return <Tag>{status}</Tag>;
  if (status === "На согласовании") return <Tag color="processing">{status}</Tag>;
  if (status === "На доработке") return <Tag color="warning">{status}</Tag>;
  if (status === "Отклонен") return <Tag color="error">{status}</Tag>;
  return <Tag color="success">{status}</Tag>;
}

export function MyDocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form] = Form.useForm<DocumentFormPayload>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const mutationError = (error: unknown) => message.error(getApiErrorMessage(error));

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["my-documents", { search: debouncedSearch, statusFilter, typeFilter, dateFrom, dateTo }],
    queryFn: () =>
      documentsApi.listMyDocuments({
        q: debouncedSearch || undefined,
        status: statusFilter as DocumentRow["status"] | undefined,
        type: typeFilter,
        dateFrom,
        dateTo
      })
  });

  const {
    data: statusStats,
    isLoading: statusStatsLoading,
    isError: statusStatsError
  } = useQuery({
    queryKey: ["my-documents", "stats"],
    queryFn: () => documentsApi.getMyDocumentsStatusStats()
  });
  const saveDocumentMutation = useMutation({
    mutationFn: async (payload: DocumentFormPayload) => {
      if (editingDocumentId) {
        return documentsApi.updateDocument(editingDocumentId, payload);
      }
      return documentsApi.createDocument(payload);
    },
    onSuccess: () => {
      message.success(editingDocumentId ? "Документ обновлен" : "Документ создан");
      setIsModalOpen(false);
      setEditingDocumentId(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    },
    onError: mutationError
  });
  const submitMutation = useMutation({
    mutationFn: documentsApi.submitForApproval,
    onSuccess: () => {
      message.success("Документ отправлен на согласование");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    },
    onError: mutationError
  });
  const resubmitMutation = useMutation({
    mutationFn: documentsApi.resubmitForApproval,
    onSuccess: () => {
      message.success("Документ повторно отправлен на согласование");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    },
    onError: mutationError
  });
  const buildListQueryParams = (): ListMyDocumentsParams => ({
    q: debouncedSearch || undefined,
    status: statusFilter as DocumentRow["status"] | undefined,
    type: typeFilter,
    dateFrom,
    dateTo
  });

  const exportMutation = useMutation({
    mutationFn: (params: ListMyDocumentsParams) => documentsApi.exportMyDocuments(params),
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-documents.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("Экспорт подготовлен");
    },
    onError: mutationError
  });
  const withdrawMutation = useMutation({
    mutationFn: documentsApi.withdrawFromApproval,
    onSuccess: () => {
      message.success("Документ отозван с согласования");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    },
    onError: mutationError
  });
  const deleteMutation = useMutation({
    mutationFn: documentsApi.deleteDocument,
    onSuccess: () => {
      message.success("Документ удален");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    },
    onError: mutationError
  });

  const openCreateModal = () => {
    setEditingDocumentId(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter(undefined);
    setTypeFilter(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveListFilters = Boolean(
    search.trim() || statusFilter || typeFilter || dateFrom || dateTo
  );

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

    setIsParsingFile(true);
    try {
      const response = await contractsApi.parseFile(file);
      const parsed = response?.parsedJson ?? {};
      const parsedAmount = Number(String(parsed?.contract_sum ?? "").replace(",", ".").replace(/\s+/g, ""));

      form.setFieldsValue({
        number: parsed?.contract_number ?? form.getFieldValue("number"),
        date: parsed?.contract_date ?? form.getFieldValue("date"),
        customerName: parsed?.customer?.name ?? form.getFieldValue("customerName"),
        customerInn: parsed?.customer?.inn ?? form.getFieldValue("customerInn"),
        executorName: parsed?.supplier?.name ?? form.getFieldValue("executorName"),
        executorInn: parsed?.supplier?.inn ?? form.getFieldValue("executorInn"),
        amount: Number.isNaN(parsedAmount) ? form.getFieldValue("amount") : parsedAmount,
        subject: parsed?.contract_subject ?? parsed?.item ?? form.getFieldValue("subject")
      });

      message.success("Файл распознан, поля формы автозаполнены");
    } catch {
      message.error("Не удалось распознать файл");
    } finally {
      setIsParsingFile(false);
      event.target.value = "";
    }
  };

  const openEditModal = async (row: DocumentRow) => {
    try {
      const details = await documentsApi.openDocument(row.id);
      setEditingDocumentId(row.id);
      form.setFieldsValue({
        type: details.type,
        number: details.fields?.number ?? "",
        date: details.fields?.date ?? "",
        customerName: details.fields?.customerName ?? "",
        customerInn: details.fields?.customerInn ?? "",
        executorName: details.fields?.executorName ?? "",
        executorInn: details.fields?.executorInn ?? "",
        amount: Number(String(details.amount).replace(",", ".")) || 0,
        subject: details.fields?.subject ?? "",
        note: details.fields?.note ?? ""
      });
      setIsModalOpen(true);
    } catch (err) {
      message.error(getApiErrorMessage(err, "Не удалось загрузить документ для редактирования"));
    }
  };

  const handleModalOk = async () => {
    const values = await form.validateFields();
    await saveDocumentMutation.mutateAsync(values);
  };

  const sortByText = (a: string | undefined, b: string | undefined) => String(a ?? "").localeCompare(String(b ?? ""), "ru");
  const sortByAmount = (a: string, b: string) => {
    const left = Number(String(a).replace(",", ".").replace(/[^\d.-]/g, ""));
    const right = Number(String(b).replace(",", ".").replace(/[^\d.-]/g, ""));
    return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
  };
  const sortByDate = (a: string | undefined, b: string | undefined) => new Date(String(a ?? "")).getTime() - new Date(String(b ?? "")).getTime();

  const columns: ColumnsType<DocumentRow> = [
    { title: "ID", dataIndex: "id", key: "id", width: 110, sorter: (a, b) => sortByText(a.id, b.id) },
    {
      title: "Тип",
      dataIndex: "type",
      key: "type",
      width: 150,
      sorter: (a, b) => sortByText(a.type, b.type)
    },
    { title: "Название", dataIndex: "title", key: "title", sorter: (a, b) => sortByText(a.title, b.title) },
    { title: "Инициатор", dataIndex: "initiator", key: "initiator", width: 170, sorter: (a, b) => sortByText(a.initiator, b.initiator) },
    { title: "Сумма", dataIndex: "amount", key: "amount", width: 140, sorter: (a, b) => sortByAmount(a.amount, b.amount) },
    {
      title: "Создан",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      sorter: (a, b) => sortByDate(a.createdAt, b.createdAt),
      render: (value?: string) => (value ? new Date(value).toLocaleString("ru-RU") : "-")
    },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      width: 150,
      sorter: (a, b) => sortByText(a.status, b.status),
      render: (value: DocumentRow["status"]) => renderStatusTag(value)
    },
    {
      title: "Действия",
      key: "actions",
      width: 320,
      render: (_, row) => (
        <Space>
          <Button type="link" onClick={() => navigate(`/documents/${row.id}`)}>
            Открыть
          </Button>
          {row.status === "Загружен" || row.status === "На доработке" ? (
            <>
              <Button type="link" onClick={() => openEditModal(row)}>
                Редактировать
              </Button>
              {row.status === "На доработке" ? (
                <Button type="link" loading={resubmitMutation.isPending} onClick={() => resubmitMutation.mutate(row.id)}>
                  Повторно отправить
                </Button>
              ) : (
                <Button type="link" loading={submitMutation.isPending} onClick={() => submitMutation.mutate(row.id)}>
                  Отправить
                </Button>
              )}
              <Button
                type="link"
                danger
                loading={deleteMutation.isPending}
                onClick={() =>
                  Modal.confirm({
                    title: "Удалить документ?",
                    content: "Документ будет удален без возможности восстановления.",
                    okText: "Удалить",
                    okButtonProps: { danger: true },
                    cancelText: "Отмена",
                    onOk: () => deleteMutation.mutateAsync(row.id)
                  })
                }
              >
                Удалить
              </Button>
            </>
          ) : null}
          {row.status === "На согласовании" ? (
            <Button
              type="link"
              loading={withdrawMutation.isPending}
              onClick={() =>
                Modal.confirm({
                  title: "Отозвать документ с согласования?",
                  content: "После отзыва документ вернется в статус 'Загружен'.",
                  okText: "Отозвать",
                  cancelText: "Отмена",
                  onOk: () => withdrawMutation.mutateAsync(row.id)
                })
              }
            >
              Отозвать
            </Button>
          ) : null}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Typography.Title level={3}>Мои документы</Typography.Title>
      <Typography.Paragraph type="secondary">
        Реестр документов с серверной фильтрацией и поиском.
      </Typography.Paragraph>

      <MyDocumentsStatusSummary stats={statusStats} loading={statusStatsLoading} isError={statusStatsError} />

      <MockApiBanner />
      {isError ? <Alert type="error" showIcon message="Не удалось загрузить список" description={getApiErrorMessage(error)} style={{ marginBottom: 16 }} /> : null}

      <Card>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap>
            <Input.Search
              placeholder="Поиск по номеру, контрагенту или ИНН"
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="Статус"
              style={{ width: 180 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { value: "На согласовании", label: "На согласовании" },
                { value: "Загружен", label: "Загружен" },
                { value: "На доработке", label: "На доработке" },
                { value: "Отклонен", label: "Отклонен" },
                { value: "Согласован", label: "Согласован" }
              ]}
            />
            <Select
              allowClear
              placeholder="Тип документа"
              style={{ width: 200 }}
              value={typeFilter}
              onChange={(value) => setTypeFilter(value)}
              options={DOCUMENT_TYPE_SELECT_OPTIONS}
            />
            <DatePicker
              placeholder="Дата с"
              format="YYYY-MM-DD"
              value={dateFrom ? dayjs(dateFrom) : undefined}
              onChange={(value) => setDateFrom(value ? value.format("YYYY-MM-DD") : undefined)}
            />
            <DatePicker
              placeholder="Дата по"
              format="YYYY-MM-DD"
              value={dateTo ? dayjs(dateTo) : undefined}
              onChange={(value) => setDateTo(value ? value.format("YYYY-MM-DD") : undefined)}
            />
            <Button onClick={resetFilters}>Сбросить фильтры</Button>
            <Tooltip
              title={
                data.length === 0 && !isLoading && !isError
                  ? "Нет строк для выгрузки при текущих фильтрах. Сбросьте фильтры или измените поиск."
                  : "В файл попадут те же документы, что и строки таблицы ниже (поиск, статус, тип, даты). Сортировка по колонкам меняет только порядок на экране."
              }
            >
              <Button
                icon={<DownloadOutlined />}
                loading={exportMutation.isPending}
                disabled={!isLoading && !isError && data.length === 0}
                onClick={() => exportMutation.mutate(buildListQueryParams())}
              >
                Выгрузить в Excel
              </Button>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Создать документ
            </Button>
          </Space>

          {hasActiveListFilters ? (
            <div>
              <Space wrap size={[8, 8]} align="center">
                <Typography.Text type="secondary">Активные условия:</Typography.Text>
                {search.trim() ? (
                  <Tag
                    closable
                    onClose={() => {
                      setSearch("");
                      setDebouncedSearch("");
                    }}
                  >
                    Поиск: «{search.trim()}»
                  </Tag>
                ) : null}
                {statusFilter ? (
                  <Tag closable onClose={() => setStatusFilter(undefined)}>
                    Статус: {statusFilter}
                  </Tag>
                ) : null}
                {typeFilter ? (
                  <Tag closable onClose={() => setTypeFilter(undefined)}>
                    Тип: {typeFilter}
                  </Tag>
                ) : null}
                {dateFrom ? (
                  <Tag closable onClose={() => setDateFrom(undefined)}>
                    Дата документа с: {dateFrom}
                  </Tag>
                ) : null}
                {dateTo ? (
                  <Tag closable onClose={() => setDateTo(undefined)}>
                    Дата документа по: {dateTo}
                  </Tag>
                ) : null}
                <Button type="link" size="small" onClick={resetFilters} style={{ paddingInline: 4 }}>
                  Сбросить всё
                </Button>
              </Space>
            </div>
          ) : null}

          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Экспорт в Excel использует те же условия, что и список в таблице (поиск, статус, тип, даты документа). Сортировка по заголовкам колонок влияет только на отображение, не на состав файла.
          </Typography.Paragraph>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={data}
            loading={isLoading}
            pagination={{ pageSize: 8 }}
            locale={{
              emptyText: (
                <Empty description="Нет документов по выбранным условиям">
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    Создать документ
                  </Button>
                </Empty>
              )
            }}
          />
        </Space>
      </Card>
      <Modal
        title={editingDocumentId ? "Редактировать документ" : "Создать документ"}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={saveDocumentMutation.isPending}
        width={760}
      >
        <Space style={{ marginBottom: 12 }}>
          <Button onClick={handlePickFile} loading={isParsingFile}>
            Загрузить PDF/DOCX для автозаполнения
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </Space>
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="Тип документа" rules={[{ required: true, message: "Укажите тип документа" }]}>
            <Select options={DOCUMENT_TYPE_SELECT_OPTIONS} placeholder="Выберите тип" />
          </Form.Item>
          <Form.Item name="number" label="Номер" rules={[{ required: true, message: "Укажите номер" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="date" label="Дата" rules={[{ required: true, message: "Укажите дату (YYYY-MM-DD)" }]}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="customerName" label="Наименование заказчика" rules={[{ required: true, message: "Укажите заказчика" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="customerInn" label="ИНН заказчика" rules={[{ required: true, message: "Укажите ИНН заказчика" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="executorName" label="Наименование исполнителя" rules={[{ required: true, message: "Укажите исполнителя" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="executorInn" label="ИНН исполнителя" rules={[{ required: true, message: "Укажите ИНН исполнителя" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label="Сумма" rules={[{ required: true, message: "Укажите сумму" }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="subject" label="Основание / предмет" rules={[{ required: true, message: "Укажите предмет документа" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
