import { Allow, IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCaseDto {
  @IsString() title: string;
  @IsString() goodsDesc: string;
  @IsString() destination: string;
  @IsInt() amountFen: number;
  @IsOptional() @IsString() currency?: string;
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

export class SaveContractDto {
  @IsString() counterparty: string;
  @IsOptional() @IsString() incoterms?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsBoolean() hasRetentionOfTitle: boolean;
  @IsBoolean() hasDisputeClause: boolean;
  @IsOptional() @IsBoolean() isFinal?: boolean;
  @IsOptional() @IsString() goodsDesc?: string;
  @IsOptional() @IsInt() amountFen?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() buyerName?: string;
  @IsOptional() @IsString() consigneeName?: string;
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
}

export class WorkbenchDto {
  @IsOptional() @IsString() hitId?: string;
  @IsString() action: string;
  @IsOptional() @IsString() comment?: string;
}
