import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './common/bootstrap/app-bootstrap';

const INSECURE_JWT_SECRETS = new Set([
  'change-this-in-production',
  'CHANGE_ME_JWT_SECRET',
]);
const INSECURE_ENCRYPTION_KEYS = new Set([
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
]);
const ENCRYPTION_KEY_PATTERN = /^[a-f0-9]{64}$/i;

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

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (
    !encryptionKey ||
    !ENCRYPTION_KEY_PATTERN.test(encryptionKey) ||
    INSECURE_ENCRYPTION_KEYS.has(encryptionKey)
  ) {
    throw new Error(
      'ENCRYPTION_KEY must be set to a strong, non-default 64-character hex value in production.',
    );
  }
}

async function bootstrap() {
  validateProductionSecurityConfig();

  const app = await NestFactory.create(AppModule);
  configureApplication(app);

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend running on http://localhost:${port}`);
}
void bootstrap();
