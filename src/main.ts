import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  // 环境变量校验由 ConfigModule.forRoot({ validate }) 在模块初始化时自动执行
  // 校验失败直接 crash,不进入 NestFactory.create
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger — 开发部署阶段暂时始终开启，上线前恢复条件判断
  // if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true')
  {
    const config = new DocumentBuilder()
      .setTitle('紧固件 SaaS ERP')
      .setDescription('报价 -> 订单 -> 采购 -> 入库 -> 发货 -> 对账 全链路 API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
