import { Tag } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, EditOutlined, InboxOutlined } from "@ant-design/icons";
import type { DocumentStatus } from "../api";

type StatusTagProps = {
  status: DocumentStatus;
  size?: "default" | "large";
};

export function StatusTag({ status, size = "default" }: StatusTagProps) {
  const className = size === "large" ? "doc-detail-status doc-detail-status--lg" : "doc-detail-status";
  if (status === "Загружен") return <Tag className={className} icon={<InboxOutlined />}>{status}</Tag>;
  if (status === "На согласовании") return <Tag className={className} color="processing" icon={<ClockCircleOutlined />}>{status}</Tag>;
  if (status === "На доработке") return <Tag className={className} color="warning" icon={<EditOutlined />}>{status}</Tag>;
  if (status === "Отклонен") return <Tag className={className} color="error" icon={<CloseCircleOutlined />}>{status}</Tag>;
  return <Tag className={className} color="success" icon={<CheckCircleOutlined />}>{status}</Tag>;
}

type PriorityTagProps = {
  priority: "Обычный" | "Срочно";
};

export function PriorityTag({ priority }: PriorityTagProps) {
  return priority === "Срочно" ? <Tag color="red">{priority}</Tag> : <Tag>{priority}</Tag>;
}
