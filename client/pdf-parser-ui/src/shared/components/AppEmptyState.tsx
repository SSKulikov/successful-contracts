import { Button, Empty } from "antd";
import type { ReactNode } from "react";

type AppEmptyStateProps = {
  description: string;
  actionText?: string;
  onAction?: () => void;
  extra?: ReactNode;
};

export function AppEmptyState({ description, actionText, onAction, extra }: AppEmptyStateProps) {
  return (
    <Empty description={description}>
      {actionText && onAction ? (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      ) : null}
      {extra}
    </Empty>
  );
}
