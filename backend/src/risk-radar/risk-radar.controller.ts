import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadExceptionFilter } from '../cases/upload.filter';
import { DemoActor, RiskRadarService, riskSampleEnabled } from './risk-radar.service';
import { RiskActionDto } from './risk-radar.dto';

type ReqWithUser = { demoUser?: { id: string; name: string; role: string } };

function actorOf(req: ReqWithUser): DemoActor {
  if (!req.demoUser?.id) throw new ForbiddenException('请先选择演示角色（请求头 x-actor-id 或 X-Demo-Role）');
  return req.demoUser;
}

@Controller('risk-radar')
export class RiskRadarController {
  constructor(private readonly radar: RiskRadarService) {}

  @Get('meta')
  meta() {
    return { sampleEnabled: riskSampleEnabled() };
  }

  @Get('mine')
  mine(@Req() req: ReqWithUser) {
    return this.radar.mine(actorOf(req));
  }

  @Get()
  list(@Req() req: ReqWithUser) {
    return this.radar.list(actorOf(req));
  }

  @Post('refresh')
  refresh(@Req() req: ReqWithUser) {
    return this.radar.refresh(actorOf(req));
  }

  @Post('rescreen')
  rescreen(@Req() req: ReqWithUser) {
    return this.radar.rescreen(actorOf(req));
  }

  @Post('samples')
  samples(@Req() req: ReqWithUser) {
    return this.radar.generateSamples(actorOf(req));
  }

  @Post('samples/clear')
  clearSamples(@Req() req: ReqWithUser) {
    return this.radar.clearSamples(actorOf(req));
  }

  @Post('supplements/:taskId/upload')
  @UseFilters(UploadExceptionFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(
    @Param('taskId') taskId: string,
    @UploadedFile() file: { originalname?: string; size?: number; buffer?: Buffer; mimetype?: string } | undefined,
    @Body('fileName') fileName: string | undefined,
    @Req() req: ReqWithUser,
  ) {
    if (!file) throw new BadRequestException('请上传补件文件');
    return this.radar.uploadSupplement(actorOf(req), taskId, file, fileName);
  }

  @Post('supplements/:taskId/accept')
  accept(@Param('taskId') taskId: string, @Req() req: ReqWithUser) {
    return this.radar.acceptSupplement(actorOf(req), taskId);
  }

  @Get(':id')
  open(@Param('id') id: string, @Req() req: ReqWithUser) {
    return this.radar.open(actorOf(req), id);
  }

  @Post(':id/actions')
  act(@Param('id') id: string, @Body() dto: RiskActionDto, @Req() req: ReqWithUser) {
    return this.radar.act(actorOf(req), id, dto);
  }

  @Post(':id/demo-expire')
  expire(@Param('id') id: string, @Req() req: ReqWithUser) {
    return this.radar.expireSupplements(actorOf(req), id);
  }
}
