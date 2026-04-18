/** Парсинг тела `POST /documents/:id/submit` — массив id сотрудников-согласующих. */
export function parseApproverEmployeeIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  return out;
}
