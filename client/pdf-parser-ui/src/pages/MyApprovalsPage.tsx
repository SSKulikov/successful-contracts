import { CheckOutlined, CloseOutlined, MoreOutlined, UndoOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Dropdown, Grid, Input, Select, Space, Table, Typography, message } from "antd";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ResizeCallbackData } from "react-resizable";
import { MockApiBanner } from "../shared/components/MockApiBanner";
import { AppEmptyState } from "../shared/components/AppEmptyState";
import { PageHeader } from "../shared/components/PageHeader";
import { ResizableHeaderCell } from "../shared/components/ResizableHeaderCell";
import { StatusLegend } from "../shared/components/StatusLegend";
import { PriorityTag } from "../shared/components/StatusTag";
import { formatDateTime, formatMoney } from "../shared/utils/format";
import { getApiErrorMessage } from "../shared/utils/api-error";
import { ApiErrorState } from "../shared/components/ApiErrorState";
import { confirmCommentAction } from "../shared/utils/confirm-actions";
import { ApprovalRow, approvalsApi, getStoredUserProfile, isPlatformAdminUser } from "../shared/api";
import { DOCUMENT_TYPE_SELECT_OPTIONS } from "../shared/documentTypes";

function formatWaitingDays(days: number): string {
  if (days <= 0) return "Сегодня";
  const n = Math.floor(days);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

export function MyApprovalsPage() {
  const COLUMN_WIDTHS_STORAGE_KEY = "my-approvals-column-widths";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    id: 110,
    type: 130,
    title: 240,
    initiator: 190,
    amount: 130,
    waitingDays: 130,
    currentStep: 170,
    receivedAt: 160,
    priority: 130,
    actions: 360
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const me = getStoredUserProfile();
  const isPlatformAdmin = Boolean(me && isPlatformAdminUser(me));
  const mutationError = (error: unknown) => message.error(getApiErrorMessage(error));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      setColumnWidths((prev) => ({ ...prev, ...parsed }));
    } catch {
      /* ignore parse errors */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch {
      /* ignore quota errors */
    }
  }, [columnWidths]);

  const { data, isLoading, isError, error, refetch } = useQuery({
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
    confirmCommentAction({
      title: `Отправить ${row.title} на доработку`,
      onSubmit: (comment) => returnMutation.mutateAsync({ approvalId: row.id, comment, documentId: row.documentId })
    });
  };
  const handleReject = async (row: ApprovalRow) =>
    rejectMutation.mutateAsync({ approvalId: row.id, documentId: row.documentId });
  const sortedApprovals = useMemo(() => {
    if (!search.trim()) return data?.items ?? [];
    return [...(data?.items ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id, "ru", { numeric: true, sensitivity: "base" })
    );
  }, [data?.items, search]);
  const resetFilters = () => {
    setSearch("");
    setTypeFilter(undefined);
    setPage(1);
  };

  const renderActions = (row: ApprovalRow) => {
    if (!isMobile) {
      return (
        <Space wrap size={[4, 4]} className="table-actions-cell">
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
      );
    }

    const items: MenuProps["items"] = [
      {
        key: "open",
        label: "Открыть",
        onClick: () => navigate(`/documents/${row.documentId ?? row.id}`)
      }
    ];
    if (row.canTakeDecision !== false) {
      items.push(
        {
          key: "approve",
          label: "Согласовать",
          disabled: actionInProgress,
          onClick: () => void handleApprove(row)
        },
        {
          key: "revise",
          label: "На доработку",
          disabled: actionInProgress,
          onClick: () => void handleRevision(row)
        },
        {
          key: "reject",
          label: "Отклонить",
          danger: true,
          disabled: actionInProgress,
          onClick: () => void handleReject(row)
        }
      );
    }

    return (
      <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
        <Button icon={<MoreOutlined />} aria-label={`Действия по задаче ${row.id}`} />
      </Dropdown>
    );
  };

  const handleResize =
    (key: string) =>
    (_event: SyntheticEvent<Element>, { size }: ResizeCallbackData) => {
      const minWidth = key === "actions" ? 220 : 90;
      setColumnWidths((prev) => ({ ...prev, [key]: Math.max(minWidth, Math.round(size.width)) }));
    };

  const columns: ColumnsType<ApprovalRow> = [
    { title: "ID", dataIndex: "id", key: "id", width: columnWidths.id },
    {
      title: "Тип",
      dataIndex: "type",
      key: "type",
      width: columnWidths.type,
      ellipsis: true,
      render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>
    },
    {
      title: "Документ",
      dataIndex: "title",
      key: "title",
      width: columnWidths.title,
      ellipsis: true,
      render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>
    },
    {
      title: "Инициатор",
      dataIndex: "initiator",
      key: "initiator",
      width: columnWidths.initiator,
      ellipsis: true,
      render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>
    },
    { title: "Сумма", dataIndex: "amount", key: "amount", width: columnWidths.amount, render: (value: string) => formatMoney(value) },
    {
      title: "В очереди",
      dataIndex: "waitingDays",
      key: "waitingDays",
      width: columnWidths.waitingDays,
      render: (days: number) => formatWaitingDays(days)
    },
    {
      title: "Этап",
      dataIndex: "currentStep",
      key: "currentStep",
      width: columnWidths.currentStep,
      ellipsis: true,
      render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>
    },
    {
      title: "Получен",
      dataIndex: "receivedAt",
      key: "receivedAt",
      width: columnWidths.receivedAt,
      render: (value: string) => formatDateTime(value)
    },
    {
      title: "Приоритет",
      dataIndex: "priority",
      key: "priority",
      width: columnWidths.priority,
      render: (value: ApprovalRow["priority"]) => <PriorityTag priority={value} />
    },
    {
      title: "Действия",
      key: "actions",
      width: isMobile ? 88 : columnWidths.actions,
      render: (_: unknown, row: ApprovalRow) => renderActions(row)
    }
  ].map((column) => ({
    ...column,
    onHeaderCell: () => ({
      width: Number(column.width),
      onResize: handleResize(String(column.key))
    })
  }));

  return (
    <div className="page-shell">
      <PageHeader
        title="В работе"
        subtitle="Документы, где от вас ожидается решение по этапу согласования."
      />

      <MockApiBanner />
      <StatusLegend />
      {isError ? (
        <ApiErrorState
          title="Не удалось загрузить задачи"
          description={getApiErrorMessage(error)}
          onRetry={() => void refetch()}
          fallbackText="Перейти к документам"
          onFallback={() => navigate("/my-documents")}
        />
      ) : null}

      <Card>
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap className="toolbar-row">
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
              options={DOCUMENT_TYPE_SELECT_OPTIONS}
            />
            <Button onClick={resetFilters}>Сбросить фильтры</Button>
          </Space>

          <Table
            className="app-table my-approvals-table"
            rowKey="id"
            components={{
              header: {
                cell: ResizableHeaderCell
              }
            }}
            columns={columns}
            dataSource={sortedApprovals}
            rowClassName={(record) =>
              record.canTakeDecision === false ? "my-approvals-row--view-only" : "my-approvals-row--actionable"
            }
            tableLayout="fixed"
            scroll={{ x: 1450 }}
            loading={isLoading || actionInProgress}
            size="small"
            locale={{
              emptyText: (
                <AppEmptyState
                  description="Нет задач на согласование"
                  extra={
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <Space wrap size={8}>
                        <Button onClick={() => navigate("/my-documents")}>Перейти к документам</Button>
                        {isPlatformAdmin ? <Button onClick={() => navigate("/admin-panel")}>Перейти в админ-панель</Button> : null}
                      </Space>
                    </div>
                  }
                />
              )
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
