import { Alert, Card, Col, Row, Statistic, Typography } from "antd";
import type { MyDocumentsByStatusStats } from "../shared/api";

const STATS_ORDER: { key: keyof MyDocumentsByStatusStats["byStatus"]; label: string }[] = [
  { key: "in_approval", label: "На согласовании" },
  { key: "revision", label: "На доработке" },
  { key: "uploaded", label: "Загружен" },
  { key: "rejected", label: "Отклонен" },
  { key: "approved", label: "Согласован" }
];

type Props = {
  stats?: MyDocumentsByStatusStats;
  loading: boolean;
  isError: boolean;
};

export function MyDocumentsStatusSummary({ stats, loading, isError }: Props) {
  if (isError) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Сводка по статусам недоступна"
        description="Список документов ниже можно использовать как обычно."
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (loading && !stats) {
    return <Card size="small" loading title="Сводка по моим документам" style={{ marginBottom: 16 }} />;
  }

  if (!stats) return null;

  const total = STATS_ORDER.reduce((sum, { key }) => sum + stats.byStatus[key], 0);

  return (
    <Card size="small" title="Сводка по моим документам" style={{ marginBottom: 16 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Учитываются все документы, которые вам видны по правилам доступа (фильтры таблицы ниже на эти цифры не влияют).
      </Typography.Paragraph>
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Всего" value={total} valueStyle={{ fontSize: 20, fontWeight: 600 }} />
        </Col>
        {STATS_ORDER.map(({ key, label }) => (
          <Col key={key} xs={12} sm={8} md={6} lg={4}>
            <Statistic title={label} value={stats.byStatus[key]} valueStyle={{ fontSize: 18 }} />
          </Col>
        ))}
      </Row>
    </Card>
  );
}
