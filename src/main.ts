import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Ativando validação global estrita com Zod
  app.useGlobalPipes(new ZodValidationPipe());

  // Liberando CORS para o Frontend Web App ler a API
  app.enableCors({
    origin: '*', // Em produção, altere para o domínio real (ex: https://meusaas.com)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Bot engine iniciada na porta ${port}`);
}
bootstrap();
