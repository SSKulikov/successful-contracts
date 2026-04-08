import { CheckOutlined, CloseOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { ApprovalRow, approvalsApi } from "../shared/api";

function renderPriority(priority: ApprovalRow["priority"]) {
  return priority === "Срочно" ? <Tag color="red">{priority}</Tag> : <Tag>{priority}</Tag>;
}

export function MyApprovalsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-approvals"],
    queryFn: approvalsApi.listMyApprovals
  });
  const approveMutation = useMutation({
    mutationFn: approvalsApi.approve,
    onSuccess: (_, approvalId) => {
      message.success(`Документ ${approvalId} согласован`);
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    }
  });
  const returnMutation = useMutation({
    mutationFn: approvalsApi.returnForRevision,
    onSuccess: (_, approvalId) => {
      message.info(`Документ ${approvalId} отправлен на доработку`);
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    }
  });
  const rejectMutation = useMutation({
    mutationFn: approvalsApi.reject,
    onSuccess: (_, approvalId) => {
      message.warning(`Документ ${approvalId} отклонен`);
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    }
  });
  const actionInProgress =
    approveMutation.isPending || returnMutation.isPending || rejectMutation.isPending;

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.filter((item) => {
      const bySearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.initiator.toLowerCase().includes(query);
      const byType = !typeFilter || item.type === typeFilter;
      const byPriority = !priorityFilter || item.priority === priorityFilter;
      return bySearch && byType && byPriority;
    });
  }, [data, search, typeFilter, priorityFilter]);

  const handleApprove = async (row: ApprovalRow) => approveMutation.mutateAsync(row.id);
  const handleRevision = async (row: ApprovalRow) => returnMutation.mutateAsync(row.id);
  const handleReject = async (row: ApprovalRow) => rejectMutation.mutateAsync(row.id);

  const columns: ColumnsType<ApprovalRow> = [
    { title: "ID", dataIndex: "id", key: "id", width: 110 },
    { title: "Тип", dataIndex: "type", key: "type", width: 140 },
    { title: "Документ", dataIndex: "title", key: "title" },
    { title: "Инициатор", dataIndex: "initiator", key: "initiator", width: 170 },
    { title: "Этап", dataIndex: "currentStep", key: "currentStep", width: 130 },
    { title: "Получен", dataIndex: "receivedAt", key: "receivedAt", width: 160 },
    {
      title: "Приоритет",
      dataIndex: "priority",
      key: "priority",
      width: 120,
      render: (value: ApprovalRow["priority"]) => renderPriority(value)
    },
    {
      title: "Действия",
      key: "actions",
      width: 280,
      render: (_, row) => (
        <Space>
          <Button type="link" icon={<CheckOutlined />} disabled={actionInProgress} onClick={() => handleApprove(row)}>
            Согласовать
          </Button>
          <Button type="link" icon={<UndoOutlined />} disabled={actionInProgress} onClick={() => handleRevision(row)}>
            На доработку
          </Button>
          <Button
            type="link"
            danger
            icon={<CloseOutlined />}
            disabled={actionInProgress}
            onClick={() => handleReject(row)}
          >
            Отклонить
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Typography.Title level={3}>Мои согласования</Typography.Title>
      <Typography.Paragraph type="secondary">
        Список документов, которые пришли вам на согласование по роли. Пока используются мок-данные.
      </Typography.Paragraph>

      <Card>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap>
            <Input.Search
              placeholder="Поиск по ID, документу или инициатору"
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="Тип документа"
              style={{ width: 200 }}
              value={typeFilter}
              onChange={(value) => setTypeFilter(value)}
              options={[
                { value: "Договор", label: "Договор" },
                { value: "УПД", label: "УПД" },
                { value: "Счет", label: "Счет" },
                { value: "Акт", label: "Акт" }
              ]}
            />
            <Select
              allowClear
              placeholder="Приоритет"
              style={{ width: 160 }}
              value={priorityFilter}
              onChange={(value) => setPriorityFilter(value)}
              options={[
                { value: "Обычный", label: "Обычный" },
                { value: "Срочно", label: "Срочно" }
              ]}
            />
          </Space>

          <Table columns={columns} dataSource={filteredData} loading={isLoading || actionInProgress} pagination={{ pageSize: 8 }} />
        </Space>
      </Card>
    </div>
  );
}
