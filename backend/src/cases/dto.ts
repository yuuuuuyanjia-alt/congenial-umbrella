import { Allow, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PROCUREMENT_CURRENCY, SALES_CURRENCY, SALES_CURRENCY_OPTIONS } from '../common/currencies';

function ToCurrency() {
  return Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    return String(value).trim().toUpperCase();
  });
}

export class CreateCaseDto {
  @IsString() title: string;
  @IsString() goodsDesc: string;
  @IsString() destination: string;
  @IsInt() amountFen: number;
  @IsOptional()
  @ToCurrency()
  @IsIn([...SALES_CURRENCY_OPTIONS], { message: '出口案件币种须为 CNY 或 USD' })
  currency?: string;
  @IsOptional() @IsString() goodsSpec?: string;
  /** 演示新建销售合同时预填买方；收货人同名。付款人不再预填。 */
  @IsOptional() @IsString() buyerName?: string;
  @IsOptional() @IsString() buyerCountry?: string;
}

export class UpsertPartyDto {
  @IsString() role: string;
  @IsString() name: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() registrationNo?: string;
  @IsOptional() @IsBoolean() isSameAsBuyer?: boolean;
  @IsOptional() @IsString() relationNote?: string;
}

export class DirectPortDto {
  @IsOptional() @IsString() warehouseLocation?: string | null;
  @IsOptional() @IsString() batchNo?: string | null;
  @IsOptional() @IsString() goodsWhereAnswer?: string | null;
  @IsOptional() @IsString() goodsWhereRef?: string | null;
  @IsOptional() @IsString() customsPartyAnswer?: string | null;
  @IsOptional() @IsString() remittanceBoundAnswer?: string | null;
  @IsOptional() @IsString() remittanceBoundRef?: string | null;
  @IsOptional() @IsBoolean() emptyTurnLikely?: boolean | null;
  @IsOptional() @IsString() emptyTurnAnswer?: string | null;
  @IsOptional() @IsString() emptyTurnRef?: string | null;
}

export class TtVoucherDto {
  @IsOptional() @IsString() ref?: string;
  @IsOptional() @IsString() fileName?: string | null;
}

export class SaveContractDto {
  @IsString() counterparty: string;
  @IsOptional() @IsString() incoterms?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsBoolean() hasRetentionOfTitle?: boolean;
  @IsOptional() @IsBoolean() hasDisputeClause?: boolean;
  @IsOptional() @IsBoolean() isFinal?: boolean;
  @IsOptional() @IsString() goodsDesc?: string;
  @IsOptional() @IsString() goodsSpec?: string;
  @IsOptional() @IsInt() amountFen?: number;
  @IsOptional()
  @ToCurrency()
  @IsIn([...SALES_CURRENCY_OPTIONS], { message: '销售合同币种须为 CNY 或 USD' })
  currency?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() buyerName?: string;
  @IsOptional() @IsString() consigneeName?: string;
  @IsOptional() @IsString() deliveryDate?: string;
  @IsOptional() @IsInt() quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() paymentDueAt?: string | null;
  @IsOptional() @IsString() shipmentPort?: string | null;
  @IsOptional() @IsString() shipmentDate?: string | null;
  @IsOptional() @IsString() domesticPortArrivalAt?: string | null;
  @IsOptional() @IsString() etaDate?: string | null;
  @IsOptional() @IsString() arrivalPort?: string | null;
  /** 销售合同装运港。不是 N6 CIF shipmentPort。 */
  @IsOptional() @IsString() loadingPort?: string | null;
  /** 销售合同装运期限，日期或文本。 */
  @IsOptional() @IsString() shipmentDeadline?: string | null;
  @IsOptional() @IsBoolean() customerPickedUp?: boolean | null;
  @IsOptional() @IsBoolean() hasRemittance?: boolean;
  @IsOptional() @IsInt() remittedFen?: number;
  @IsOptional() @IsString() ttTiming?: string | null;
  @IsOptional() @IsInt() ttPercentBps?: number | null;
  @IsOptional() @IsInt() ttAdvanceFen?: number | null;
  @IsOptional() @IsInt() ttDaysAfterShipment?: number | null;
  @IsOptional() @IsIn(['OWN_WAREHOUSE', 'BONDED', 'DIRECT_PORT']) deliveryMode?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => DirectPortDto)
  directPort?: DirectPortDto;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TtVoucherDto)
  ttVouchers?: TtVoucherDto[];
}

export class SaveShipmentDto {
  @IsBoolean() hasCustomerWrittenInstruction: boolean;
  @IsOptional() @IsString() instructionRef?: string;
  @IsBoolean() hasInternalApproval: boolean;
  @IsOptional() @IsString() approverId?: string;
  @IsOptional() @IsString() blControl?: string;
  @IsOptional() @IsString() blNo?: string;
  @IsOptional() @IsString() vessel?: string;
  @IsOptional() @IsString() consigneeOnBl?: string;
  @IsOptional() @IsString() noBlReason?: string;
  @IsOptional() @IsString() noBlRef?: string;
  @IsOptional() @IsString() noBlEvidenceStub?: string;
  @IsOptional() @IsString() incotermsOverride?: string;
  @IsOptional() @IsString() shipmentPort?: string | null;
  @IsOptional() @IsString() shipmentDate?: string | null;
  @IsOptional() @IsString() etaDate?: string | null;
  @IsOptional() @IsString() arrivalPort?: string | null;
}

export class SaveDocumentDto {
  @IsString() type: string;
  @IsOptional() @IsBoolean() isFinal?: boolean;
  @Allow()
  @IsObject()
  fields: Record<string, string | number | null>;
}

export class SaveFixDto {
  @IsString() field: string;
  @IsString() fromValue: string;
  @IsString() toValue: string;
  @IsString() reason: string;
}

export class SaveSettlementDto {
  @IsString() payerName: string;
  @IsString() buyerName: string;
  @IsOptional() @IsBoolean() isThirdParty?: boolean;
  @IsOptional() @IsBoolean() hasThirdPartyProof?: boolean;
  @IsOptional() @IsString() thirdPartyProofRef?: string;
  @IsOptional() @IsBoolean() hasRemittanceMemo?: boolean;
  @IsOptional() @IsString() remittanceMemoRef?: string;
  @IsOptional() @IsBoolean() hasDocConsistencyProof?: boolean;
  @IsOptional() @IsBoolean() hasReleaseApproval?: boolean;
  @IsOptional() @IsInt() amountFen?: number;
  @IsOptional() @IsString() receivedAt?: string;
}

export class WorkbenchDto {
  @IsOptional() @IsString() hitId?: string;
  @IsOptional() @IsString() reviewId?: string;
  @IsString() action: string;
  @IsOptional() @IsString() comment?: string;
}

export class SaveTaxRebateDto {
  @IsOptional() @IsString() inputInvoiceNo?: string | null;
  @IsOptional() @IsBoolean() flowGoods?: boolean;
  @IsOptional() @IsBoolean() flowCustoms?: boolean;
  @IsOptional() @IsBoolean() flowInvoice?: boolean;
  @IsOptional() @IsBoolean() flowRemittance?: boolean;
}

export class SaveQuoteDto {
  @IsOptional() @IsString() priceBasis?: string;
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (Array.isArray(value)) return value;
    return value;
  })
  includedItems?: string | string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedItemCodes?: string[];
  @IsOptional() @IsString() excludedItems?: string;
  @IsOptional() @IsString() validityUntil?: string;
  @IsOptional() @IsString() freightBearer?: string;
  @IsOptional() @IsString() taxBearer?: string;
  @IsOptional() @IsInt() unitPriceFen?: number;
  @IsOptional() @IsIn(['TON', 'KG', '吨', '千克']) unit?: string;
  @IsOptional() @IsInt() quantity?: number;
  @IsOptional() @IsInt() amountFen?: number;
  @IsOptional()
  @ToCurrency()
  @IsIn([...SALES_CURRENCY_OPTIONS], { message: '报价币种须为 CNY 或 USD' })
  currency?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() abnormalPriceNote?: string;
  @IsOptional() @IsString() goodsDesc?: string;
  @IsOptional() @IsString() goodsSpec?: string;
}

export class ChangeDiffDto {
  @IsString() field: string;
  @IsOptional() @IsString() oldValue?: string;
  @IsString() newValue: string;
}

export class CreateChangeDto {
  @IsOptional() @IsString() reason?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChangeDiffDto)
  diffs: ChangeDiffDto[];
}

export class AckChangeDto {
  @IsString() type: string;
  @IsOptional() @IsString() ref?: string;
  @IsOptional() @IsString() note?: string;
}

export class SavePlanInstallmentDto {
  @IsOptional() @IsInt() seq?: number;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsInt() percentBps?: number;
  @IsOptional() @IsNumber() percent?: number;
  @IsOptional() @IsInt() amountFen?: number;
  @IsOptional() @IsString() conditionText?: string;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsInt() paidFen?: number;
  @IsOptional() @IsString() paidAt?: string;
}

export class SavePlanDto {
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() supplierNameEn?: string;
  @IsOptional() @IsString() supplierCountry?: string;
  @IsOptional() @IsString() supplierAddress?: string;
  @IsOptional() @IsString() supplierRegistrationNo?: string;
  @IsOptional() @IsString() poNo?: string;
  @IsOptional() @IsString() plannedArrival?: string;
  @IsOptional() @IsString() plannedDelivery?: string;
  @IsOptional() @IsString() contractDelivery?: string;
  @IsOptional() @IsString() poEvidenceStub?: string;
  @IsOptional() @IsString() poFileName?: string;
  @IsOptional() @IsBoolean() delayRegistered?: boolean;
  @IsOptional() @IsString() delayTriggerCode?: string;
  @IsOptional() @IsString() delayTriggerRef?: string;
  @IsOptional() @IsString() delayReason?: string;
  @IsOptional() @IsBoolean() customerConsent?: boolean;
  @IsOptional() @IsString() customerConsentRef?: string;
  @IsOptional() @IsString() actualArrival?: string;
  @IsOptional() @IsInt() amountFen?: number;
  @IsOptional()
  @ToCurrency()
  @IsIn([PROCUREMENT_CURRENCY], { message: '采购合同币种须为 CNY' })
  currency?: string;
  @IsOptional() @IsInt() paidFen?: number;
  @IsOptional() @IsString() paymentDueAt?: string;
  @IsOptional() @IsString() paidAt?: string;
  @IsOptional() @IsIn(['FULL', 'STAGED']) paymentMode?: string;
  @IsOptional() @IsString() paymentConditionText?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePlanInstallmentDto)
  installments?: SavePlanInstallmentDto[];
  /** 关联的销售/出口案件 id（须已签销售合同） */
  @IsOptional() @IsString() salesCaseId?: string;
  /** 采购合同货物名称。与销售合同分列保存，不回写 N3。 */
  @IsOptional() @IsString() goodsDesc?: string | null;
  /** 采购合同规格。与销售合同分列保存，不回写 N3。 */
  @IsOptional() @IsString() goodsSpec?: string | null;
}

export class SaveSinosureDto {
  @IsOptional() @IsString() evidenceRef?: string;
  @IsOptional() @IsString() fileName?: string;
  /** 已上传保单证据，或沿用本案已有中信保证据 */
  @IsOptional() @IsString() evidenceId?: string;
  @IsOptional() @IsInt() insuredLimitFen?: number;
  @IsOptional()
  @ToCurrency()
  @IsIn([SALES_CURRENCY], { message: '中信保限额币种须为 USD' })
  currency?: string;
  @IsOptional() @IsString() changeOrderId?: string;
  @IsOptional() @IsBoolean() confirmedExisting?: boolean;
}
