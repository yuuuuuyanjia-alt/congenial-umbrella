import { isCifFamilyIncoterms } from '../gates/gate.engine';

export { isCifFamilyIncoterms };

export function resolveRemittedFen(input: {
  hasRemittance?: boolean | null;
  remittedFen?: number | null;
}): number {
  if (!input.hasRemittance) return 0;
  const n = Number(input.remittedFen);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** 未收汇金额（分）= 合同总额 − 收汇金额，不小于 0。 */
export function unpaidRemittanceFen(amountFen?: number | null, remittedFen?: number | null): number {
  const amount = Math.max(0, Number(amountFen) || 0);
  const remitted = Math.max(0, Number(remittedFen) || 0);
  return Math.max(0, amount - remitted);
}

export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
  },
>(row: T): T & { remittedFen: number; unpaidFen: number; cifShippingVisible: boolean };
export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
  },
>(
  row: T | null | undefined,
): (T & { remittedFen: number; unpaidFen: number; cifShippingVisible: boolean }) | null;
export function presentSalesContract<
  T extends {
    incoterms?: string | null;
    amountFen?: number | null;
    hasRemittance?: boolean | null;
    remittedFen?: number | null;
  },
>(
  row: T | null | undefined,
): (T & { remittedFen: number; unpaidFen: number; cifShippingVisible: boolean }) | null {
  if (!row) return null;
  const remittedFen = resolveRemittedFen(row);
  return {
    ...row,
    remittedFen,
    unpaidFen: unpaidRemittanceFen(row.amountFen, remittedFen),
    cifShippingVisible: isCifFamilyIncoterms(row.incoterms),
  };
}
