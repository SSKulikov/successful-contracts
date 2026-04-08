import { ArrowLeftOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Descriptions, List, Space, Tag, Typography, message } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { approvalsApi, DocumentDetails, documentsApi } from "../shared/api";

function renderStatusTag(status: DocumentDetails["status"]) {
  if (status === "На согласовании") return <Tag color="processing">{status}</Tag>;
  if (status === "На доработке") return <Tag color="warning">{status}</Tag>;
  if (status === "Отклонен") return <Tag color="error">{status}</Tag>;
  return <Tag color="success">{status}</Tag>;
}

function renderProcessMode(status: DocumentDetails["status"] | undefined) {
  if (status === "На доработке") return <Tag color="warning">Режим: доработка инициатором</Tag>;
  if (status === "На согласовании") return <Tag color="processing">Режим: ожидание согласования</Tag>;
  if (status === "Согласован") return <Tag color="success">Режим: завершен (согласован)</Tag>;
  if (status === "Отклонен") return <Tag color="error">Режим: завершен (отклонен)</Tag>;
  return <Tag>Режим: неизвестен</Tag>;
}

export function DocumentDetailsPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["document-details", id],
    queryFn: () => documentsApi.openDocument(id),
    enabled: Boolean(id)
  });
  const approveMutation = useMutation({
    mutationFn: approvalsApi.approve,
    onSuccess: () => {
      message.success("Документ согласован");
      queryClient.invalidateQueries({ queryKey: ["document-details", id] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    }
  });
  const returnMutation = useMutation({
    mutationFn: approvalsApi.returnForRevision,
    onSuccess: () => {
      message.info("Документ отправлен на доработку");
      queryClient.invalidateQueries({ queryKey: ["document-details", id] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    }
  });
  const rejectMutation = useMutation({
    mutationFn: approvalsApi.reject,
    onSuccess: () => {
      message.warning("Документ отклонен");
      queryClient.invalidateQueries({ queryKey: ["document-details", id] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    }
  });
  const resubmitMutation = useMutation({
    mutationFn: documentsApi.resubmitForApproval,
    onSuccess: () => {
      message.success("Документ повторно отправлен на согласование");
      queryClient.invalidateQueries({ queryKey: ["document-details", id] });
      queryClient.invalidateQueries({ queryKey: ["my-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
    }
  });
  const actionInProgress =
    approveMutation.isPending ||
    returnMutation.isPending ||
    rejectMutation.isPending ||
    resubmitMutation.isPending;
  const isFinalStatus = data?.status === "Согласован" || data?.status === "Отклонен";
  const isRevisionStatus = data?.status === "На доработке";

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/my-documents")}>
          Назад к документам
        </Button>
      </Space>

      <Card loading={isLoading}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          {data?.title ?? "Карточка документа"}
        </Typography.Title>
        <Space style={{ marginBottom: 12 }}>{renderProcessMode(data?.status)}</Space>
        {isRevisionStatus ? (
          <Space style={{ marginBottom: 16 }} wrap>
            <Button type="primary" disabled={actionInProgress || !id} onClick={() => resubmitMutation.mutate(id)}>
              Повторно отправить на согласование
            </Button>
          </Space>
        ) : !isFinalStatus ? (
          <Space style={{ marginBottom: 16 }} wrap>
            <Button type="primary" disabled={actionInProgress || !id} onClick={() => approveMutation.mutate(id)}>
              Согласовать
            </Button>
            <Button disabled={actionInProgress || !id} onClick={() => returnMutation.mutate(id)}>
              На доработку
            </Button>
            <Button danger disabled={actionInProgress || !id} onClick={() => rejectMutation.mutate(id)}>
              Отклонить
            </Button>
          </Space>
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Документ находится в финальном статусе. Действия согласования недоступны.
          </Typography.Paragraph>
        )}
        <Descriptions bordered column={2} size="middle">
          <Descriptions.Item label="ID">{data?.id ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Статус">{data ? renderStatusTag(data.status) : "-"}</Descriptions.Item>
          <Descriptions.Item label="Тип">{data?.type ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Инициатор">{data?.initiator ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Сумма">{data?.amount ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Текущий этап">{data?.currentStep ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Создан">{data?.createdAt ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Обновлен">{data?.updatedAt ?? "-"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="История действий" loading={isLoading || actionInProgress}>
        <List
          dataSource={data?.history ?? []}
          locale={{ emptyText: "История пока пустая" }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta title={item.action} description={`${item.date} | ${item.author}`} />
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
