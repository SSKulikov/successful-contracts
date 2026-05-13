import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Col, Divider, Form, Input, InputNumber, Modal, Row, Select, Space, Steps, Table, Tabs, Timeline, Typography, Upload, message } from "antd";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MockApiBanner } from "../shared/components/MockApiBanner";
import { DOCUMENT_TYPE_SELECT_OPTIONS } from "../shared/documentTypes";
import {
  SubmitForApprovalModal,
  type SubmitForApprovalModalResult
} from "../shared/components/SubmitForApprovalModal";
import { getApiErrorMessage } from "../shared/utils/api-error";
import {
  approvalsApi,
  documentsApi,
  DocumentDetails,
  DocumentHistoryVariant,
  getStoredUserProfile,
  isPlatformAdminUser,
  type SubmitForApprovalPayload
} from "../shared/api";
import { StatusTag } from "../shared/components/StatusTag";
import { formatDateTime, formatMoney } from "../shared/utils/format";
import { confirmCommentAction, confirmDangerAction } from "../shared/utils/confirm-actions";
import { ApiErrorState } from "../shared/components/ApiErrorState";

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
  const [editForm] = Form.useForm();
  const [submitRouteModalOpen, setSubmitRouteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [attachmentFileList, setAttachmentFileList] = useState<File[]>([]);
  const editDocumentButtonRef = useRef<HTMLButtonElement | null>(null);

  const me = getStoredUserProfile();
  const isPlatformAdmin = Boolean(me && isPlatformAdminUser(me));

  const mutationError = (error: unknown) => message.error(getApiErrorMessage(error));

  const { data, isLoading, isError, error, refetch } = useQuery({
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
    mutationFn: ({ documentId, ...payload }: { documentId: string } & SubmitForApprovalPayload) =>
      documentsApi.submitForApproval(documentId, payload),
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
  const updateDocumentMutation = useMutation({
    mutationFn: (payload: {
      type: string;
      number: string;
      date: string;
      customerName: string;
      customerInn: string;
      executorName: string;
      executorInn: string;
      amount: number;
      subject: string;
      note?: string;
    }) => documentsApi.updateDocument(id, payload),
    onSuccess: () => {
      message.success("Документ обновлен");
      setEditModalOpen(false);
      invalidateAll();
    },
    onError: mutationError
  });
  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => documentsApi.uploadDocumentAttachment(id, file),
    onSuccess: () => {
      message.success("Файл прикреплен");
      queryClient.invalidateQueries({ queryKey: ["document-details", id] });
      setAttachmentFileList([]);
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
  const canDelete = data != null && data.canDeleteDocuments !== false;
  const canSubmit = data?.canSubmitForApproval === true || (data?.canSubmitForApproval === undefined && st === "Загружен");
  const canResubmit =
    data?.canResubmitForApproval === true || (data?.canResubmitForApproval === undefined && st === "На доработке");

  const handleRevise = () => {
    if (!data?.activeTaskId) return;
    confirmCommentAction({
      title: "Отправить документ на доработку",
      onSubmit: (comment) => reviseMutation.mutateAsync({ taskId: data.activeTaskId!, comment })
    });
  };

  const openSubmitRouteModal = () => {
    if (!id) return;
    if (isPlatformAdmin && data?.companyId == null) {
      message.error("У документа не указана компания — отредактируйте карточку или создайте документ заново.");
      return;
    }
    setSubmitRouteModalOpen(true);
  };

  const openEditModal = () => {
    if (!data) return;
    editForm.setFieldsValue({
      type: data.type,
      number: data.fields?.number ?? "",
      date: data.fields?.date ?? "",
      customerName: data.fields?.customerName ?? "",
      customerInn: data.fields?.customerInn ?? "",
      executorName: data.fields?.executorName ?? "",
      executorInn: data.fields?.executorInn ?? "",
      amount: Number(String(data.amount).replace(",", ".")) || 0,
      subject: data.fields?.subject ?? "",
      note: data.fields?.note ?? ""
    });
    setEditModalOpen(true);
  };

  const handleSaveEditedDocument = async () => {
    const values = await editForm.validateFields();
    await updateDocumentMutation.mutateAsync(values);
  };

  useEffect(() => {
    if (editModalOpen) return;
    editDocumentButtonRef.current?.focus();
  }, [editModalOpen]);

  const handleSubmitForApproval = async (result: SubmitForApprovalModalResult) => {
    if (!id) return;
    if (result.kind === "route") {
      await submitMutation.mutateAsync({ documentId: id, routeId: result.routeId });
    } else {
      await submitMutation.mutateAsync({ documentId: id, approverEmployeeIds: result.approverEmployeeIds });
    }
    setSubmitRouteModalOpen(false);
  };

  const fields = data?.fields;
  const actionPrimary = canSubmit || canResubmit || canApproveInCard;

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }} className="page-shell">
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/my-documents")}>
          Назад к документам
        </Button>
        <Button onClick={() => navigate("/my-approvals")}>К задачам согласования</Button>
      </Space>

      <MockApiBanner />
      {isError ? (
        <ApiErrorState
          title="Не удалось загрузить карточку"
          description={getApiErrorMessage(error)}
          onRetry={() => void refetch()}
          fallbackText="Вернуться к документам"
          onFallback={() => navigate("/my-documents")}
        />
      ) : null}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="doc-kpi-card">
            <Typography.Text type="secondary">Статус</Typography.Text>
            <div style={{ marginTop: 8 }}>{data ? <StatusTag status={data.status} /> : "—"}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="doc-kpi-card">
            <Typography.Text type="secondary">Этап</Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 0 }}>{data?.currentStep ?? "—"}</Typography.Paragraph>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="doc-kpi-card">
            <Typography.Text type="secondary">Инициатор</Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 0 }}>{data?.initiator ?? "—"}</Typography.Paragraph>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="doc-kpi-card">
            <Typography.Text type="secondary">Создан</Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 0 }}>{formatDateTime(data?.createdAt)}</Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <Card className="doc-detail-card" loading={isLoading && !isError}>
        <div className="doc-detail-hero">
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Space align="start" wrap size={16} style={{ justifyContent: "space-between", width: "100%" }}>
              <div>
                <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
                  {data?.title ?? "Карточка документа"}
                </Typography.Title>
                <div style={{ marginTop: 4 }}>
                  <Typography.Text strong className="doc-detail-step-label">
                    {data?.currentStep ?? "—"}
                  </Typography.Text>
                </div>
                {data?.approvalChain?.length ? (
                  <Typography.Paragraph
                    type="secondary"
                    style={{ marginTop: 10, marginBottom: 0, whiteSpace: "pre-wrap", fontSize: 13 }}
                  >
                    {data.approvalChain.join("\n")}
                  </Typography.Paragraph>
                ) : null}
              </div>
              {data ? <StatusTag status={data.status} size="large" /> : null}
            </Space>
            <Steps
              size="small"
              className="doc-detail-steps"
              current={workflowStepIndex(data?.status)}
              items={[{ title: "Загрузка" }, { title: "Согласование" }, { title: "Итог" }]}
            />
          </Space>
        </div>

        <Divider style={{ margin: "20px 0" }} />

        <Divider plain titlePlacement="start" style={{ margin: "0 0 12px" }}>
          Действия
        </Divider>
        <Space wrap style={{ marginBottom: 8 }}>
          {data?.canEditDocumentFields ? (
            <Button ref={editDocumentButtonRef} disabled={actionInProgress} onClick={openEditModal}>
              Редактировать
            </Button>
          ) : null}
          {canSubmit ? (
            <Button type="primary" disabled={actionInProgress || !id} onClick={() => void openSubmitRouteModal()}>
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
              {!(!isPlatformAdmin && canWithdraw) ? (
                <Button
                  type="primary"
                  disabled={actionInProgress || !data?.activeTaskId}
                  onClick={() => approveMutation.mutate(data.activeTaskId!)}
                >
                  Согласовать
                </Button>
              ) : null}
              <Button disabled={actionInProgress || !data?.activeTaskId} onClick={handleRevise}>
                На доработку
              </Button>
              <Button danger disabled={actionInProgress || !data?.activeTaskId} onClick={() => rejectMutation.mutate(data.activeTaskId!)}>
                Отклонить
              </Button>
            </>
          ) : null}
          {canWithdraw ? (
            <>
              {!isPlatformAdmin && canApproveInCard ? (
                <Button
                  type="primary"
                  disabled={actionInProgress || !data?.activeTaskId}
                  onClick={() => approveMutation.mutate(data.activeTaskId!)}
                >
                  Согласовать
                </Button>
              ) : null}
              <Button
                type={actionPrimary ? "default" : "primary"}
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
            </>
          ) : null}
          {canDelete ? (
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={actionInProgress || !id}
              aria-label="Удалить документ"
              onClick={() =>
                confirmDangerAction({
                  title: "Удалить документ?",
                  content: "Документ будет удален без возможности восстановления.",
                  okText: "Удалить",
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
            Решения по согласованию — в разделе «В работе».
          </Typography.Paragraph>
        ) : null}
      </Card>

      <Card title="Реквизиты и сумма" className="doc-detail-card" loading={isLoading && !isError}>
        <Table
          dataSource={[{ key: "main" }]}
          pagination={false}
          size="small"
          style={{ tableLayout: "fixed" }}
          columns={[
            { title: "Тип", key: "type", width: "16.6%", render: () => data?.type ?? "—" },
            { title: "Сумма", key: "amount", width: "16.6%", render: () => formatMoney(data?.amount) },
            { title: "Примечание", key: "note", width: "16.6%", render: () => fields?.note?.trim() ? fields.note : "—" },
            { title: "Номер", key: "number", width: "16.6%", render: () => fields?.number ?? "—" },
            { title: "Предмет/основание", key: "subject", width: "16.6%", render: () => fields?.subject ?? "—" },
            { title: "Дата", key: "date", width: "16.6%", render: () => fields?.date ?? "—" }
          ]}
        />
        <Typography.Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>Заказчик</Typography.Title>
        <Table
          dataSource={[{ key: "customer" }]}
          pagination={false}
          size="small"
          style={{ tableLayout: "fixed" }}
          columns={[
            { title: "Наименование", key: "customerName", width: "50%", render: () => fields?.customerName ?? "—" },
            { title: "ИНН", key: "customerInn", width: "50%", render: () => fields?.customerInn ?? "—" }
          ]}
        />
        <Typography.Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>Исполнитель</Typography.Title>
        <Table
          dataSource={[{ key: "executor" }]}
          pagination={false}
          size="small"
          style={{ tableLayout: "fixed" }}
          columns={[
            { title: "Наименование", key: "executorName", width: "50%", render: () => fields?.executorName ?? "—" },
            { title: "ИНН", key: "executorInn", width: "50%", render: () => fields?.executorInn ?? "—" }
          ]}
        />
      </Card>

      <Card className="doc-detail-card" loading={isLoading && !isError}>
        <Tabs
          items={[
            {
              key: "attachments",
              label: "Прикрепленные документы",
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Upload
                    beforeUpload={(file) => {
                      setAttachmentFileList([file]);
                      return false;
                    }}
                    fileList={attachmentFileList as never[]}
                    onRemove={() => {
                      setAttachmentFileList([]);
                      return true;
                    }}
                    maxCount={1}
                  >
                    <Button>Выбрать файл</Button>
                  </Upload>
                  <Button
                    type="primary"
                    disabled={!attachmentFileList[0]}
                    loading={uploadAttachmentMutation.isPending}
                    onClick={() => {
                      if (attachmentFileList[0]) uploadAttachmentMutation.mutate(attachmentFileList[0]);
                    }}
                  >
                    Загрузить вложение
                  </Button>
                  <Table
                    rowKey="id"
                    dataSource={data?.attachments ?? []}
                    pagination={false}
                    columns={[
                      { title: "Документ", dataIndex: "originalName", key: "originalName" },
                      { title: "Дата загрузки", dataIndex: "uploadedAt", key: "uploadedAt", width: 180 },
                      { title: "Дата изменения", dataIndex: "updatedAt", key: "updatedAt", width: 180 },
                      {
                        title: "Открыть",
                        key: "open",
                        width: 120,
                        render: (_, row: { url: string }) => (
                          <Button type="link" style={{ paddingLeft: 0 }} onClick={() => window.open(row.url, "_blank", "noopener,noreferrer")}>
                            Открыть
                          </Button>
                        )
                      }
                    ]}
                  />
                </Space>
              )
            }
          ]}
        />
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
            items={(data?.history ?? []).map((item) => ({
              key: item.id,
              color: timelineColor(item.variant),
              children: (
                <span className="doc-detail-timeline__entry">
                  <span className="doc-detail-timeline__date">{item.date}</span>
                  <span className="doc-detail-timeline__author">{item.author}</span>
                  <span className="doc-detail-timeline__action">{item.action}</span>
                </span>
              )
            }))}
          />
        )}
      </Card>
      <SubmitForApprovalModal
        open={submitRouteModalOpen}
        documentId={id || null}
        documentType={data?.type ?? "—"}
        companyId={data?.companyId ?? me?.companyId ?? null}
        isPlatformAdmin={isPlatformAdmin}
        submitLoading={submitMutation.isPending}
        onClose={() => setSubmitRouteModalOpen(false)}
        onSubmit={handleSubmitForApproval}
      />
      <Modal
        title="Редактировать документ"
        open={editModalOpen}
        onOk={() => void handleSaveEditedDocument()}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={updateDocumentMutation.isPending}
        width={760}
      >
        <Form form={editForm} layout="vertical">
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
    </Space>
  );
}
