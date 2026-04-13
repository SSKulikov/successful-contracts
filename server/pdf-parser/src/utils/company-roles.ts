/**
 * Условие «в roles_json есть роль admin» (MySQL JSON).
 * Используется для инварианта: у компании не более одного такого сотрудника.
 */
export function companyAdminRoleSqlCondition(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `JSON_CONTAINS(CAST(${p}roles_json AS JSON), '"admin"', '$')`;
}

type RawClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export async function countCompanyAdminsTx(tx: RawClient, companyId: number): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM employees WHERE company_id = ? AND ${companyAdminRoleSqlCondition()}`,
    companyId
  );
  return Number(rows[0]?.c ?? 0);
}

export async function lockCompanyRowForUpdate(tx: RawClient, companyId: number): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM companies WHERE id = ? FOR UPDATE`,
    companyId
  );
  return !!rows[0];
}
