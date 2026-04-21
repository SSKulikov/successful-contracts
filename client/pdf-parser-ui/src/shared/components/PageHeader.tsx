import { Space, Typography } from "antd";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <Space direction="vertical" size={2}>
        <Typography.Title level={3} className="page-title">
          {title}
        </Typography.Title>
        {subtitle ? (
          <Typography.Text type="secondary" className="page-subtitle">
            {subtitle}
          </Typography.Text>
        ) : null}
      </Space>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}
