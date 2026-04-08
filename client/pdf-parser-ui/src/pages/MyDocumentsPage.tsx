import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DocumentRow, documentsApi } from "../shared/api";

function renderStatusTag(status: DocumentRow["status"]) {
  if (status === "На согласовании") return <Tag color="processing">{status}</Tag>;
  if (status === "На доработке") return <Tag color="warning">{status}</Tag>;
  if (status === "Отклонен") return <Tag color="error">{status}</Tag>;
  return <Tag color="success">{status}</Tag>;
}

export function MyDocumentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: documentsApi.listMyDocuments
  });
  const exportMutation = useMutation({
    mutationFn: documentsApi.exportMyDocuments,
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-documents.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("Экспорт подготовлен");
    }
  });

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.filter((doc) => {
      const bySearch =
        !query ||
        doc.title.toLowerCase().includes(query) ||
        doc.id.toLowerCase().includes(query) ||
        doc.initiator.toLowerCase().includes(query);
      const byStatus = !statusFilter || doc.status === statusFilter;
      const byType = !typeFilter || doc.type === typeFilter;

      return bySearch && byStatus && byType;
    });
  }, [data, search, statusFilter, typeFilter]);

  const columns: ColumnsType<DocumentRow> = [
    { title: "ID", dataIndex: "id", key: "id", width: 110 },
    { title: "Тип", dataIndex: "type", key: "type", width: 150 },
    { title: "Название", dataIndex: "title", key: "title" },
    { title: "Инициатор", dataIndex: "initiator", key: "initiator", width: 170 },
    { title: "Сумма", dataIndex: "amount", key: "amount", width: 140 },
    {
      title: "Статус",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (value: DocumentRow["status"]) => renderStatusTag(value)
    },
    {
      title: "Действия",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Button type="link" onClick={() => navigate(`/documents/${row.id}`)}>
          Открыть
        </Button>
      )
    }
  ];

  return (
    <div>
      <Typography.Title level={3}>Мои документы</Typography.Title>
      <Typography.Paragraph type="secondary">
        Реестр документов с базовыми фильтрами, поиском и экспортом. Данные пока моковые, далее подключим API.
      </Typography.Paragraph>

      <Card>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap>
            <Input.Search
              placeholder="Поиск по ID, названию или инициатору"
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
              options={[
                { value: "Договор", label: "Договор" },
                { value: "Счет на оплату", label: "Счет на оплату" },
                { value: "Акт", label: "Акт" }
              ]}
            />
            <Button icon={<DownloadOutlined />} loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
              Выгрузить в Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/contracts")}>
              Создать документ
            </Button>
          </Space>

          <Table
            columns={columns}
            dataSource={filteredData}
            loading={isLoading}
            pagination={{ pageSize: 8 }}
          />
        </Space>
      </Card>
    </div>
  );
}
