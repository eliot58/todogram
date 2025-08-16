import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyCorsOptions } from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import "./instrument";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      ignoreTrailingSlash: true,
      bodyLimit: 200 * 1024 * 1024,
    }),
  );

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 200 * 1024 * 1024,
    },
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true
  }));

  const corsOptions: FastifyCorsOptions = {
    origin: [
      'http://0.0.0.0:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'null'
    ],
    credentials: true,
    methods: '*',
    allowedHeaders: ['*', 'Authorization', 'Content-Type']
  };

  app.enableCors(corsOptions);

  const config = new DocumentBuilder()
    .setTitle('Todogram actions API')
    .setDescription('The todogram API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(3000, '0.0.0.0');
}
bootstrap();
