import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

/** 只挂在保单上传路由上，把 Multer 超限转成中文 400。 */
@Catch()
export class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const code = (exception as { code?: string })?.code;
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ statusCode: 400, message: '保单文件不能超过 15MB' });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }
    const message = exception instanceof Error ? exception.message : '保单文件无法上传';
    res.status(400).json({ statusCode: 400, message });
  }
}
