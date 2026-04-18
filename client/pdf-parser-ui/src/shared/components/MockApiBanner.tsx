import { Alert } from "antd";

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";

export function MockApiBanner() {
  if (!USE_MOCK_API) return null;
  return (
    <Alert
      type="info"
      showIcon
      message="Демо-данные"
      description="Мок API (VITE_USE_MOCK_API=true), данные не с сервера."
      style={{ marginBottom: 16 }}
    />
  );
}
