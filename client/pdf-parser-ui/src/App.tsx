import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import ruRU from "antd/locale/ru_RU";
import { RouterProvider } from "react-router-dom";
import { appRouter } from "./app/router";

const queryClient = new QueryClient();

/** Единая палитра с лендингом и кастомными блоками в `styles.css` */
const appTheme = {
  token: {
    colorPrimary: "#334155",
    borderRadius: 8,
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif'
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
