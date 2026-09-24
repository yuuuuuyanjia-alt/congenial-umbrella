import { BadRequestException } from '@nestjs/common';
import { isSalesCurrency, normalizeCurrency, SALES_CURRENCY } from '../common/currencies';
import { salesCustomerOf, type SalesLinkCaseInput } from './sales-link';
import { parseQuoteIncludedItems, quoteIncludedItemLabels } from './quote-fields';

/** 金额以分存储，与销售合同 amountFen 相同。超过 32 位整数则拒绝。 */
export const CONTRACT_FEE_MAX_FEN = 2_147_483_647;
export const CONTRACT_FEE_MAX_CUSTOM = 40;
export const CONTRACT_FEE_NAME_MAX = 40;

export type ContractFeeAmounts = {
  oceanFreightFen: number | null;
  inlandFreightFen: number | null;
  portChargesFen: number | null;
  insuranceFen: number | null;
};

export type CustomContractFee = {
  name: string;
  amountFen: number | null;
};

export type NormalizedContractFees = ContractFeeAmounts & {
  custom: CustomContractFee[];
  customJson: string;
};

export class ContractFeeInputError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type FeeCurrencySource = 'contract' | 'case' | 'default';

export type FeeCurrency = {
  code: 'USD' | 'CNY';
  source: FeeCurrencySource;
  label: string;
};

/**
 * 币种跟随销售合同。合同未登记时用案件币种；都没有则标明按美元。
 * 不在费用页另选币种。
 */
export function resolveFeeCurrency(contractCurrency?: string | null, caseCurrency?: string | null): FeeCurrency {
  const fromContract = normalizeCurrency(contractCurrency);
  if (isSalesCurrency(fromContract)) {
    return { code: fromContract, source: 'contract', label: `${fromContract}（跟随销售合同）` };
  }
  const fromCase = normalizeCurrency(caseCurrency);
  if (isSalesCurrency(fromCase)) {
    const word = fromCase === 'CNY' ? '人民币' : '美元';
    return { code: fromCase, source: 'case', label: `${fromCase}（销售合同未登记币种，按案件${word}）` };
  }
  return { code: SALES_CURRENCY, source: 'default', label: 'USD（销售合同未登记币种，按美元）' };
}

function optionalFen(raw: unknown, label: string): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ContractFeeInputError(`${label}须为整数分，或留空`);
  }
  if (n < 0) throw new ContractFeeInputError(`${label}不能为负`);
  if (n > CONTRACT_FEE_MAX_FEN) throw new ContractFeeInputError(`${label}过大`);
  return n;
}

/**
 * 全部选填。未传与 null 都记为空。自定义行里名称和金额都空的不入库。
 * 保存是整单替换，不按出运批次。
 */
export function normalizeContractFees(input?: {
  oceanFreightFen?: unknown;
  inlandFreightFen?: unknown;
  portChargesFen?: unknown;
  insuranceFen?: unknown;
  custom?: Array<{ name?: unknown; amountFen?: unknown }> | null;
} | null): NormalizedContractFees {
  const customIn = input?.custom ?? [];
  if (!Array.isArray(customIn)) throw new ContractFeeInputError('自定义费用须为列表');
  if (customIn.length > CONTRACT_FEE_MAX_CUSTOM) {
    throw new ContractFeeInputError(`自定义费用最多 ${CONTRACT_FEE_MAX_CUSTOM} 行`);
  }
  const custom: CustomContractFee[] = [];
  customIn.forEach((row, index) => {
    const name = String(row?.name ?? '').trim();
    if (name.length > CONTRACT_FEE_NAME_MAX) {
      throw new ContractFeeInputError(`第 ${index + 1} 行费用名称不能超过 ${CONTRACT_FEE_NAME_MAX} 字`);
    }
    const amountFen = optionalFen(row?.amountFen, `第 ${index + 1} 行金额`);
    if (!name && amountFen == null) return;
    custom.push({ name, amountFen });
  });
  const amounts: ContractFeeAmounts = {
    oceanFreightFen: optionalFen(input?.oceanFreightFen, '海运费'),
    inlandFreightFen: optionalFen(input?.inlandFreightFen, '陆运费'),
    portChargesFen: optionalFen(input?.portChargesFen, '港杂'),
    insuranceFen: optionalFen(input?.insuranceFen, '保险'),
  };
  return { ...amounts, custom, customJson: JSON.stringify(custom) };
}

export function parseCustomFees(raw?: string | null): CustomContractFee[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeContractFees({ custom: parsed }).custom;
  } catch (err) {
    if (err instanceof ContractFeeInputError) return [];
    return [];
  }
}

export type ContractFeeView = ContractFeeAmounts & {
  caseId: string;
  caseNo: string;
  title: string;
  customer: string;
  currency: 'USD' | 'CNY';
  currencySource: FeeCurrencySource;
  currencyLabel: string;
  custom: CustomContractFee[];
  /** 报价所含项目原文标签。只提示，不写入费用金额。 */
  quoteIncludedLabels: string | null;
};

export function presentContractFees(input: {
  id: string;
  caseNo: string;
  title: string;
  currency?: string | null;
  contract?: { currency?: string | null; counterparty?: string | null; buyerName?: string | null } | null;
  parties?: Array<{ role: string; name: string }> | null;
  quotes?: Array<{ includedItems?: string | null; version?: number | null }> | null;
  contractFee?: (ContractFeeAmounts & { customJson?: string | null }) | null;
}): ContractFeeView {
  const currency = resolveFeeCurrency(input.contract?.currency, input.currency);
  const fee = input.contractFee;
  const latest = [...(input.quotes || [])].sort((a, b) => (b.version || 0) - (a.version || 0))[0];
  const quoteIncludedLabels = latest ? quoteIncludedItemLabels(parseQuoteIncludedItems(latest.includedItems)) : '';
  const customer = salesCustomerOf({
    id: input.id,
    caseNo: input.caseNo,
    title: input.title,
    status: '',
    currentNode: '',
    goodsDesc: '',
    destination: '',
    amountFen: 0,
    currency: currency.code,
    contract: input.contract,
    parties: input.parties || [],
  } as SalesLinkCaseInput);
  return {
    caseId: input.id,
    caseNo: input.caseNo,
    title: input.title,
    customer,
    currency: currency.code,
    currencySource: currency.source,
    currencyLabel: currency.label,
    oceanFreightFen: fee?.oceanFreightFen ?? null,
    inlandFreightFen: fee?.inlandFreightFen ?? null,
    portChargesFen: fee?.portChargesFen ?? null,
    insuranceFen: fee?.insuranceFen ?? null,
    custom: parseCustomFees(fee?.customJson),
    quoteIncludedLabels: quoteIncludedLabels || null,
  };
}

export function contractFeeInputError(err: unknown): BadRequestException | null {
  if (err instanceof ContractFeeInputError) return new BadRequestException(err.message);
  return null;
}
