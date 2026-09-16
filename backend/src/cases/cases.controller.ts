import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CasesService } from './cases.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateCaseDto,
  SaveContractDto,
  SaveDocumentDto,
  SaveFixDto,
  SaveSettlementDto,
  SaveShipmentDto,
  UpsertPartyDto,
} from './dto';

@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.cases.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.cases.get(id);
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

  @Post(':id/nodes/N1/screen')
  screen(@Param('id') id: string, @Headers('x-actor-id') actorId?: string) {
    return this.cases.screenKyc(id, actorId);
  }

  @Post(':id/nodes/N3/contract')
  contract(
    @Param('id') id: string,
    @Body() dto: SaveContractDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.saveContract(id, dto, actorId);
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
}
