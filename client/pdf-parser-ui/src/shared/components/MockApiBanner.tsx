import { Alert } from "antd";

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";

export function MockApiBanner() {
  if (!USE_MOCK_API) return null;
  return (
    <Alert
      type="info"
      showIcon
      message="Демо-данные"
      description="Включён мок API (VITE_USE_MOCK_API=true). Ответы не отражают состояние сервера."
      style={{ marginBottom: 16 }}
    />
  );
}
