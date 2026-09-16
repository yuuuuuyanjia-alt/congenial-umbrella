import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`出口风控后端已启动 http://127.0.0.1:${port}/api/health`);
}

bootstrap();
