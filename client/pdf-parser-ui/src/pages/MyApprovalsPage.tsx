import { CheckOutlined, CloseOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MockApiBanner } from "../shared/components/MockApiBanner";
import { getApiErrorMessage } from "../shared/utils/api-error";
import { ApprovalRow, approvalsApi } from "../shared/api";

function renderPriority(priority: ApprovalRow["priority"]) {
  return priority === "Срочно" ? <Tag color="red">{priority}</Tag> : <Tag>{priority}</Tag>;
}

export function MyApprovalsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const mutationError = (error: unknown) => message.error(getApiErrorMessage(error));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-approvals", { search, typeFilter, page, pageSize }],
    queryFn: () =>
      approvalsApi.listMyApprovals({
        q: search.trim() || undefined,
        type: typeFilter,
        page,
        pageSize
      })
  });
  const approveMutation = useMutation({
    mutationFn: ({ approvalId }: { approvalId: string; documentId?: string }) => approvalsApi.approve(approvalId),
    onSuccess: (_, payload) => {
      message.success(`Документ ${payload.approvalId} согласован`);
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      if (payload.documentId) {
        queryClient.invalidateQueries({ queryKey: ["document-details", payload.documentId] });
      }
    },
    onError: mutationError
  });
  const returnMutation = useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment: string; documentId?: string }) =>
      approvalsApi.returnForRevision(approvalId, { comment }),
    onSuccess: (_, payload) => {
      message.info(`Документ ${payload.approvalId} отправлен на доработку`);
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      if (payload.documentId) {
        queryClient.invalidateQueries({ queryKey: ["document-details", payload.documentId] });
      }
    },
    onError: mutationError
  });
  const rejectMutation = useMutation({
    mutationFn: ({ approvalId }: { approvalId: string; documentId?: string }) => approvalsApi.reject(approvalId),
    onSuccess: (_, payload) => {
      message.warning(`Документ ${payload.approvalId} отклонен`);
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      if (payload.documentId) {
        queryClient.invalidateQueries({ queryKey: ["document-details", payload.documentId] });
      }
    },
    onError: mutationError
  });
  const actionInProgress =
    approveMutation.isPending || returnMutation.isPending || rejectMutation.isPending;

  const handleApprove = async (row: ApprovalRow) =>
    approveMutation.mutateAsync({ approvalId: row.id, documentId: row.documentId });
  const handleRevision = async (row: ApprovalRow) => {
    let comment = "";
    Modal.confirm({
      title: `Отправить ${row.title} на доработку`,
      content: (
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 6 }}
          placeholder="Комментарий обязателен"
          onChange={(event) => {
            comment = event.target.value;
          }}
        />
      ),
      onOk: async () => {
        const value = comment.trim();
        if (!value) {
          message.error("Комментарий обязателен");
          throw new Error("Комментарий обязателен");
        }
        await returnMutation.mutateAsync({ approvalId: row.id, comment: value, documentId: row.documentId });
      }
    });
  };
  const handleReject = async (row: ApprovalRow) =>
    rejectMutation.mutateAsync({ approvalId: row.id, documentId: row.documentId });

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
      width: 340,
      render: (_, row) => (
        <Space>
          <Button type="link" disabled={actionInProgress} onClick={() => navigate(`/documents/${row.documentId ?? row.id}`)}>
            Открыть
          </Button>
          {row.canTakeDecision !== false ? (
            <>
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
            </>
          ) : null}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Typography.Title level={3}>В работе</Typography.Title>
      <Typography.Paragraph type="secondary">
        Список задач, назначенных вам на согласование.
      </Typography.Paragraph>

      <MockApiBanner />
      {isError ? (
        <Alert type="error" showIcon message="Не удалось загрузить задачи" description={getApiErrorMessage(error)} style={{ marginBottom: 16 }} />
      ) : null}

      <Card>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap>
            <Input.Search
              placeholder="Поиск по ID, документу или инициатору"
              allowClear
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="Тип документа"
              style={{ width: 200 }}
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
              options={[
                { value: "Договор", label: "Договор" },
                { value: "УПД", label: "УПД" },
                { value: "Счет", label: "Счет" },
                { value: "Акт", label: "Акт" }
              ]}
            />
          </Space>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={data?.items ?? []}
            loading={isLoading || actionInProgress}
            locale={{
              emptyText: <Empty description="Нет задач на согласование. Когда появятся новые назначения, они отобразятся здесь." />
            }}
            pagination={{
              current: data?.meta.page ?? page,
              pageSize: data?.meta.pageSize ?? pageSize,
              total: data?.meta.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [8, 16, 32],
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage);
                if (nextPageSize && nextPageSize !== pageSize) {
                  setPageSize(nextPageSize);
                }
              }
            }}
          />
        </Space>
      </Card>
    </div>
  );
}
