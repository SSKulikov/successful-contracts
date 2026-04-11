import { ArrowLeftOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Descriptions, Divider, Input, Modal, Space, Steps, Tag, Timeline, Typography, message } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { MockApiBanner } from "../shared/components/MockApiBanner";
import { getApiErrorMessage } from "../shared/utils/api-error";
import { DocumentDetails, DocumentHistoryVariant, approvalsApi, documentsApi } from "../shared/api";

function renderStatusTag(status: DocumentDetails["status"], size: "default" | "large" = "default") {
  const className = size === "large" ? "doc-detail-status doc-detail-status--lg" : "doc-detail-status";
  if (status === "Загружен") return <Tag className={className}>{status}</Tag>;
  if (status === "На согласовании") return <Tag className={className} color="processing">{status}</Tag>;
  if (status === "На доработке") return <Tag className={className} color="warning">{status}</Tag>;
  if (status === "Отклонен") return <Tag className={className} color="error">{status}</Tag>;
  return <Tag className={className} color="success">{status}</Tag>;
}

function workflowStepIndex(status: DocumentDetails["status"] | undefined): number {
  if (!status) return 0;
  if (status === "Загружен" || status === "На доработке") return 0;
  if (status === "На согласовании") return 1;
  if (status === "Согласован" || status === "Отклонен") return 2;
  return 0;
}

function timelineColor(variant: DocumentHistoryVariant | undefined): string {
  switch (variant) {
    case "approve":
      return "green";
    case "reject":
      return "red";
    case "revise":
      return "orange";
    case "submit":
    case "resubmit":
      return "blue";
    case "create":
      return "default";
    case "withdraw":
      return "gray";
    case "update":
      return "cyan";
    default:
      return "gray";
  }
}

export function DocumentDetailsPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const queryClient = useQueryClient();

  const mutationError = (error: unknown) => message.error(getApiErrorMessage(error));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["document-details", id],
    queryFn: () => documentsApi.openDocument(id),
    enabled: Boolean(id)
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["document-details", id] });
    queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["my-documents"] });
  };

  const approveMutation = useMutation({
    mutationFn: approvalsApi.approve,
    onSuccess: () => {
      message.success("Документ согласован");
      invalidateAll();
    },
    onError: mutationError
  });
  const rejectMutation = useMutation({
    mutationFn: approvalsApi.reject,
    onSuccess: () => {
      message.warning("Документ отклонен");
      invalidateAll();
    },
    onError: mutationError
  });
  const reviseMutation = useMutation({
    mutationFn: ({ taskId, comment }: { taskId: string; comment: string }) => approvalsApi.returnForRevision(taskId, { comment }),
    onSuccess: () => {
      message.info("Документ отправлен на доработку");
      invalidateAll();
    },
    onError: mutationError
  });
  const resubmitMutation = useMutation({
    mutationFn: documentsApi.resubmitForApproval,
    onSuccess: () => {
      message.success("Документ повторно отправлен на согласование");
      invalidateAll();
    },
    onError: mutationError
  });
  const submitMutation = useMutation({
    mutationFn: documentsApi.submitForApproval,
    onSuccess: () => {
      message.success("Документ отправлен на согласование");
      invalidateAll();
    },
    onError: mutationError
  });
  const withdrawMutation = useMutation({
    mutationFn: documentsApi.withdrawFromApproval,
    onSuccess: () => {
      message.success("Документ отозван с согласования");
      invalidateAll();
    },
    onError: mutationError
  });
  const deleteMutation = useMutation({
    mutationFn: documentsApi.deleteDocument,
    onSuccess: () => {
      message.success("Документ удален");
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      navigate("/my-documents");
    },
    onError: mutationError
  });

  const actionInProgress =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    reviseMutation.isPending ||
    resubmitMutation.isPending ||
    submitMutation.isPending ||
    withdrawMutation.isPending ||
    deleteMutation.isPending;

  const isFinalStatus = data?.status === "Согласован" || data?.status === "Отклонен";
  const isRevisionStatus = data?.status === "На доработке";
  const canApproveInCard = !isRevisionStatus && !isFinalStatus && data?.canApproveCurrentStep && Boolean(data?.activeTaskId);

  const st = data?.status;
  const canWithdraw =
    data?.canWithdrawDocuments === true || (data?.canWithdrawDocuments === undefined && st === "На согласовании");
  const canDelete =
    data?.canDeleteDocuments === true ||
    (data?.canDeleteDocuments === undefined && (st === "Загружен" || st === "На доработке"));
  const canSubmit = data?.canSubmitForApproval === true || (data?.canSubmitForApproval === undefined && st === "Загружен");
  const canResubmit =
    data?.canResubmitForApproval === true || (data?.canResubmitForApproval === undefined && st === "На доработке");

  const handleRevise = () => {
    if (!data?.activeTaskId) return;
    let comment = "";
    Modal.confirm({
      title: "Отправить документ на доработку",
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
        await reviseMutation.mutateAsync({ taskId: data.activeTaskId!, comment: value });
      }
    });
  };

  const fields = data?.fields;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/my-documents")}>
          Назад к документам
        </Button>
      </Space>

      <MockApiBanner />
      {isError ? (
        <Alert type="error" showIcon message="Не удалось загрузить карточку" description={getApiErrorMessage(error)} />
      ) : null}

      <Card className="doc-detail-card" loading={isLoading && !isError}>
        <div className="doc-detail-hero">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space align="start" wrap size={16} style={{ justifyContent: "space-between", width: "100%" }}>
              <div>
                <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
                  {data?.title ?? "Карточка документа"}
                </Typography.Title>
                <Typography.Text type="secondary">Текущий этап согласования</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Typography.Text strong className="doc-detail-step-label">
                    {data?.currentStep ?? "—"}
                  </Typography.Text>
                </div>
              </div>
              {data ? renderStatusTag(data.status, "large") : null}
            </Space>
            <Steps
              size="small"
              className="doc-detail-steps"
              current={workflowStepIndex(data?.status)}
              items={[
                { title: "Подготовка", description: "Черновик и правки" },
                { title: "Согласование", description: "Решения по шагам" },
                { title: "Итог", description: "Согласован или отклонен" }
              ]}
            />
          </Space>
        </div>

        <Divider style={{ margin: "20px 0" }} />

        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Действия
        </Typography.Text>
        <Space wrap style={{ marginBottom: 8 }}>
          {canSubmit ? (
            <Button type="primary" disabled={actionInProgress || !id} onClick={() => submitMutation.mutate(id)}>
              Отправить на согласование
            </Button>
          ) : null}
          {canResubmit ? (
            <Button type="primary" disabled={actionInProgress || !id} onClick={() => resubmitMutation.mutate(id)}>
              Повторно отправить на согласование
            </Button>
          ) : null}
          {canApproveInCard ? (
            <>
              <Button type="primary" disabled={actionInProgress || !data?.activeTaskId} onClick={() => approveMutation.mutate(data.activeTaskId!)}>
                Согласовать
              </Button>
              <Button disabled={actionInProgress || !data?.activeTaskId} onClick={handleRevise}>
                На доработку
              </Button>
              <Button danger disabled={actionInProgress || !data?.activeTaskId} onClick={() => rejectMutation.mutate(data.activeTaskId!)}>
                Отклонить
              </Button>
            </>
          ) : null}
          {canWithdraw ? (
            <Button
              disabled={actionInProgress}
              onClick={() =>
                Modal.confirm({
                  title: "Отозвать документ с согласования?",
                  content: "Документ вернется в статус «Загружен».",
                  okText: "Отозвать",
                  cancelText: "Отмена",
                  onOk: () => withdrawMutation.mutateAsync(id)
                })
              }
            >
              Отозвать с согласования
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              danger
              disabled={actionInProgress}
              onClick={() =>
                Modal.confirm({
                  title: "Удалить документ?",
                  content: "Документ будет удален без возможности восстановления.",
                  okText: "Удалить",
                  okButtonProps: { danger: true },
                  cancelText: "Отмена",
                  onOk: () => deleteMutation.mutateAsync(id)
                })
              }
            >
              Удалить
            </Button>
          ) : null}
        </Space>

        {!canApproveInCard && !isFinalStatus && !canSubmit && !canResubmit && !canWithdraw && !canDelete ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Действия согласования доступны в разделе «В работе», если вам назначена задача.
          </Typography.Paragraph>
        ) : null}
        {isFinalStatus ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Документ в финальном статусе. Согласование завершено.
          </Typography.Paragraph>
        ) : null}
      </Card>

      <Card title="Реквизиты и сумма" className="doc-detail-card" loading={isLoading && !isError}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="middle">
          <Descriptions.Item label="Тип">{data?.type ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Номер">{fields?.number ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Дата">{fields?.date ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Сумма">{data?.amount ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Предмет / основание" span={2}>
            {fields?.subject ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Примечание" span={2}>
            {fields?.note?.trim() ? fields.note : "—"}
          </Descriptions.Item>
        </Descriptions>
        <Divider plain titlePlacement="start">
          Заказчик
        </Divider>
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="middle">
          <Descriptions.Item label="Наименование">{fields?.customerName ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="ИНН">{fields?.customerInn ?? "—"}</Descriptions.Item>
        </Descriptions>
        <Divider plain titlePlacement="start">
          Исполнитель
        </Divider>
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="middle">
          <Descriptions.Item label="Наименование">{fields?.executorName ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="ИНН">{fields?.executorInn ?? "—"}</Descriptions.Item>
        </Descriptions>
        <Divider plain titlePlacement="start">
          Служебное
        </Divider>
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="middle">
          <Descriptions.Item label="ID">{data?.id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Инициатор (контрагент в списке)">{data?.initiator ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Создан">{data?.createdAt ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Обновлен">{data?.updatedAt ?? "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="История действий"
        className="doc-detail-card doc-detail-history-card"
        loading={(isLoading && !isError) || actionInProgress}
      >
        {(data?.history?.length ?? 0) === 0 ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            История пока пустая
          </Typography.Paragraph>
        ) : (
          <Timeline
            mode="left"
            items={(data?.history ?? []).map((item) => ({
              key: item.id,
              color: timelineColor(item.variant),
              label: (
                <span className="doc-detail-timeline__meta">
                  <span className="doc-detail-timeline__date">{item.date}</span>
                  <span className="doc-detail-timeline__author">{item.author}</span>
                </span>
              ),
              children: <span className="doc-detail-timeline__action">{item.action}</span>
            }))}
          />
        )}
      </Card>
    </Space>
  );
}
