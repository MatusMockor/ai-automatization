import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

const INSECURE_JWT_SECRETS = new Set([
  'change-this-in-production',
  'CHANGE_ME_JWT_SECRET',
]);

function validateProductionSecurityConfig(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (
    !jwtSecret ||
    jwtSecret.length < 32 ||
    INSECURE_JWT_SECRETS.has(jwtSecret)
  ) {
    throw new Error(
      'JWT_SECRET must be set to a strong, non-default value in production.',
    );
  }
}

async function bootstrap() {
  validateProductionSecurityConfig();

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend running on http://localhost:${port}`);
}
void bootstrap();
