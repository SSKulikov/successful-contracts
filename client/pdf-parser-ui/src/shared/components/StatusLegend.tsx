import { Space, Typography } from "antd";

export function StatusLegend() {
  const items = [
    { className: "status-dot status-dot--neutral", label: "Загружен" },
    { className: "status-dot status-dot--processing", label: "На согласовании" },
    { className: "status-dot status-dot--warning", label: "На доработке" },
    { className: "status-dot status-dot--error", label: "Отклонен" },
    { className: "status-dot status-dot--success", label: "Согласован" }
  ];

  return (
    <Space wrap size={[10, 8]}>
      {items.map((item) => (
        <Typography.Text key={item.label} type="secondary" className="status-legend-item">
          <span className={item.className} />
          {item.label}
        </Typography.Text>
      ))}
    </Space>
  );
}
