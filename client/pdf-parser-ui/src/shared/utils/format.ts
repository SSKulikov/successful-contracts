export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatMoney(value?: string | number | null): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 2
    }).format(value);
  }
  const trimmed = value.trim();
  if (!trimmed) return "—";
  const normalized = Number(trimmed.replace(/\s+/g, "").replace("₽", "").replace(",", "."));
  if (Number.isNaN(normalized)) return trimmed;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2
  }).format(normalized);
}
