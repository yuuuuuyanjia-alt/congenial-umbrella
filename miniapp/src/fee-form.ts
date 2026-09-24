/** 费用页金额：界面按元录入，接口按分。留空是 null，不是 0。 */

const MAX_FEN = 2_147_483_647;

export function optionalYuanToFen(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('金额须为非负数字，可留空');
  const fen = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(fen) || fen > MAX_FEN) throw new Error('金额过大');
  return fen;
}

export function yuanInputFromFen(fen?: number | null): string {
  if (fen == null || !Number.isFinite(Number(fen))) return '';
  return (Number(fen) / 100).toFixed(2);
}

export type FeeDraft = {
  oceanYuan: string;
  inlandYuan: string;
  portYuan: string;
  insuranceYuan: string;
};

export type FeeCustomDraft = { name: string; amountYuan: string };

export function feeSaveBody(form: FeeDraft, rows: FeeCustomDraft[]) {
  return {
    oceanFreightFen: optionalYuanToFen(form.oceanYuan),
    inlandFreightFen: optionalYuanToFen(form.inlandYuan),
    portChargesFen: optionalYuanToFen(form.portYuan),
    insuranceFen: optionalYuanToFen(form.insuranceYuan),
    custom: rows.map((row) => ({
      name: row.name,
      amountFen: optionalYuanToFen(row.amountYuan),
    })),
  };
}
