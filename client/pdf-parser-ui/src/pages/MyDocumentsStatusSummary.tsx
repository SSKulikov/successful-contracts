import { Alert, Card, Col, Row, Statistic } from "antd";
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
      <Alert type="warning" showIcon message="Сводка по статусам недоступна" style={{ marginBottom: 16 }} />
    );
  }

  if (loading && !stats) {
    return <Card size="small" loading title="Сводка по моим документам" style={{ marginBottom: 16 }} />;
  }

  if (!stats) return null;

  const total = STATS_ORDER.reduce((sum, { key }) => sum + stats.byStatus[key], 0);

  const statBlock = (title: string, value: number, valueSize: number) => (
    <div style={{ textAlign: "center", padding: "12px 8px" }}>
      <Statistic
        title={<span style={{ fontSize: 13 }}>{title}</span>}
        value={value}
        valueStyle={{
          fontSize: valueSize,
          fontWeight: 600,
          textAlign: "center",
          display: "block",
          lineHeight: 1.2
        }}
      />
    </div>
  );

  return (
    <Card size="small" title="Сводка по моим документам" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 16]} justify="center" wrap>
        <Col xs={12} sm={8} md={6} lg={4} flex="1 1 120px" style={{ maxWidth: 200 }}>
          {statBlock("Всего", total, 26)}
        </Col>
        {STATS_ORDER.map(({ key, label }) => (
          <Col key={key} xs={12} sm={8} md={6} lg={4} flex="1 1 120px" style={{ maxWidth: 200 }}>
            {statBlock(label, stats.byStatus[key], 22)}
          </Col>
        ))}
      </Row>
    </Card>
  );
}
