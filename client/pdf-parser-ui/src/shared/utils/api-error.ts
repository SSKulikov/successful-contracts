import { isAxiosError } from "axios";

export function getApiErrorMessage(error: unknown, fallback = "Произошла ошибка"): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message && typeof data.message === "string") return data.message;
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
