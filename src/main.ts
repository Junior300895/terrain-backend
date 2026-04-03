import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Prefix global /api
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:80', 'http://localhost', 'https://terrain-osy.vercel.app'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Validation globale
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  }));

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('⚽ Terrain Dakar API')
    .setDescription('API NestJS — Réservation de terrain de football')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`\n🚀 API démarrée sur http://localhost:${port}/api`);
  console.log(`📚 Swagger disponible sur http://localhost:${port}/api/docs\n`);
}
bootstrap();
