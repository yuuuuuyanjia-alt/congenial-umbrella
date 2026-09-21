import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CasesService } from './cases.service';
import { AuditService } from '../audit/audit.service';
import {
  AckChangeDto,
  CreateCaseDto,
  CreateChangeDto,
  SaveContractDto,
  SaveCustomsDto,
  SaveDocumentDto,
  SaveFixDto,
  SaveInquiryDto,
  SavePlanDto,
  SaveQuoteDto,
  SaveSettlementDto,
  SaveShipmentDto,
  SaveSinosureDto,
  SaveTaxRebateDto,
  UpsertPartyDto,
} from './dto';

@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query('kind') kind?: string) {
    return this.cases.list(kind);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.cases.get(id);
  }

  @Get(':id/sinosure-exposure')
  exposure(
    @Param('id') id: string,
    @Query('newAmountFen') newAmountFen?: string,
    @Query('currency') currency?: string,
  ) {
    const amount = newAmountFen != null && newAmountFen !== '' ? Number(newAmountFen) : undefined;
    return this.cases.exposurePreview(id, {
      newAmountFen: Number.isFinite(amount as number) ? amount : undefined,
      newCurrency: currency,
    });
  }

  @Get(':id/audit')
  auditTrail(@Param('id') id: string) {
    return this.audit.list(id);
  }

  @Post()
  create(@Body() dto: CreateCaseDto, @Headers('x-actor-id') actorId?: string) {
    return this.cases.create(dto, actorId);
  }

  @Post(':id/parties')
  party(
    @Param('id') id: string,
    @Body() dto: UpsertPartyDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.upsertParty(id, dto, actorId);
  }

  @Post(':id/nodes/N1/inquiry')
  inquiry(
    @Param('id') id: string,
    @Body() dto: SaveInquiryDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveInquiry(id, dto, actorId);
  }

  @Post(':id/nodes/N1/screen')
  screen(@Param('id') id: string, @Headers('x-actor-id') actorId?: string) {
    return this.cases.screenKyc(id, actorId);
  }

  @Post(':id/nodes/N2/quotes')
  quote(
    @Param('id') id: string,
    @Body() dto: SaveQuoteDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveQuote(id, dto, actorId);
  }

  @Post(':id/nodes/N3/contract')
  contract(
    @Param('id') id: string,
    @Body() dto: SaveContractDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveContract(id, dto, actorId);
  }

  @Post(':id/nodes/N3/sinosure')
  saveN3Sinosure(
    @Param('id') id: string,
    @Body() dto: SaveSinosureDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveSinosure(id, 'N3', dto, actorId);
  }

  @Post(':id/nodes/N4/sinosure')
  saveN4Sinosure(
    @Param('id') id: string,
    @Body() dto: SaveSinosureDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveSinosure(id, 'N4', dto, actorId);
  }

  @Post(':id/nodes/N4/changes')
  createChange(
    @Param('id') id: string,
    @Body() dto: CreateChangeDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.createChange(id, dto, actorId);
  }

  @Post(':id/nodes/N4/changes/:changeId/ack')
  ackChange(
    @Param('id') id: string,
    @Param('changeId') changeId: string,
    @Body() dto: AckChangeDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.ackChange(id, changeId, dto, actorId);
  }

  @Post(':id/nodes/N4/changes/:changeId/apply')
  applyChange(
    @Param('id') id: string,
    @Param('changeId') changeId: string,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.applyChange(id, changeId, actorId);
  }

  @Post(':id/nodes/N5/plan')
  plan(
    @Param('id') id: string,
    @Body() dto: SavePlanDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.savePlan(id, dto, actorId);
  }

  @Get(':id/nodes/N5/sales-options')
  salesOptions(@Param('id') id: string) {
    return this.cases.listSalesOptions(id);
  }

  @Post(':id/nodes/N5/screen')
  screenSupplier(@Param('id') id: string, @Headers('x-actor-id') actorId?: string) {
    return this.cases.screenSupplier(id, actorId);
  }

  @Post(':id/nodes/N6/shipment')
  shipment(
    @Param('id') id: string,
    @Body() dto: SaveShipmentDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveShipment(id, dto, actorId);
  }

  @Post(':id/nodes/N7/documents')
  document(
    @Param('id') id: string,
    @Body() dto: SaveDocumentDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveDocument(id, dto, actorId);
  }

  @Post(':id/nodes/N7/fixes')
  fix(
    @Param('id') id: string,
    @Body() dto: SaveFixDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveFix(id, dto, actorId);
  }

  @Post(':id/nodes/N8/customs')
  customs(
    @Param('id') id: string,
    @Body() dto: SaveCustomsDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveCustoms(id, dto, actorId);
  }

  @Post(':id/nodes/N8/eport-sync')
  eport(@Param('id') id: string, @Headers('x-actor-id') actorId?: string) {
    return this.cases.syncEport(id, actorId);
  }

  @Post(':id/nodes/N9/settlement')
  settlement(
    @Param('id') id: string,
    @Body() dto: SaveSettlementDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveSettlement(id, dto, actorId);
  }

  @Get(':id/nodes/:code/gate')
  preview(@Param('id') id: string, @Param('code') code: string) {
    return this.cases.previewGate(id, code);
  }

  @Post(':id/nodes/:code/advance')
  advance(
    @Param('id') id: string,
    @Param('code') code: string,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.advance(id, code, actorId);
  }

  @Post(':id/tax-rebate')
  saveTaxRebate(
    @Param('id') id: string,
    @Body() dto: SaveTaxRebateDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveTaxRebate(id, dto, actorId);
  }

  @Post(':id/tax-rebate/declare')
  declareTaxRebate(@Param('id') id: string, @Headers('x-actor-id') actorId?: string) {
    return this.cases.declareTaxRebate(id, actorId);
  }
}
