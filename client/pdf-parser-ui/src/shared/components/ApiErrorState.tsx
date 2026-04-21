import { Alert, Button, Space } from "antd";

type ApiErrorStateProps = {
  title: string;
  description: string;
  onRetry?: () => void;
  retryText?: string;
  fallbackText?: string;
  onFallback?: () => void;
};

export function ApiErrorState({
  title,
  description,
  onRetry,
  retryText = "Повторить",
  fallbackText,
  onFallback
}: ApiErrorStateProps) {
  return (
    <Alert
      type="error"
      showIcon
      message={title}
      description={description}
      action={
        <Space>
          {onRetry ? (
            <Button size="small" onClick={onRetry}>
              {retryText}
            </Button>
          ) : null}
          {fallbackText && onFallback ? (
            <Button size="small" onClick={onFallback}>
              {fallbackText}
            </Button>
          ) : null}
        </Space>
      }
    />
  );
}
