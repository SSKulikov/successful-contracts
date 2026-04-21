import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import ruRU from "antd/locale/ru_RU";
import { RouterProvider } from "react-router-dom";
import { appRouter } from "./app/router";

const queryClient = new QueryClient();

/** Единая палитра с лендингом и кастомными блоками в `styles.css` */
const appTheme = {
  token: {
    colorPrimary: "#5b5ce8",
    colorInfo: "#5b5ce8",
    colorSuccess: "#16a34a",
    colorWarning: "#f59e0b",
    colorError: "#ef4444",
    colorTextBase: "#1f2937",
    colorBgLayout: "#f6f8fb",
    colorBorder: "#e6eaf0",
    borderRadius: 10,
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif'
  },
  components: {
    Layout: {
      headerBg: "#ffffff",
      bodyBg: "#f6f8fb",
      siderBg: "#ffffff"
    },
    Card: {
      borderRadiusLG: 12
    },
    Button: {
      borderRadius: 10,
      controlHeight: 36
    },
    Input: {
      controlHeight: 36
    },
    Select: {
      controlHeight: 36
    },
    Menu: {
      itemBorderRadius: 10,
      itemActiveBg: "#eef0ff",
      itemSelectedBg: "#eef0ff",
      itemSelectedColor: "#4f46e5",
      itemColor: "#667085"
    },
    Table: {
      borderColor: "#e6eaf0",
      headerBg: "#f8fafc",
      headerColor: "#334155"
    }
  }
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={ruRU} theme={appTheme}>
        <RouterProvider router={appRouter} />
      </ConfigProvider>
    </QueryClientProvider>
  );
}
