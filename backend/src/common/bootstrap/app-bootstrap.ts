import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEFAULT_SWAGGER_PATH = 'api/docs';

const isEnabled = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ENABLED_VALUES.has(value.toLowerCase());
};

const resolveSwaggerPath = (pathValue: string | undefined): string => {
  const normalized = (pathValue ?? DEFAULT_SWAGGER_PATH)
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  return normalized || DEFAULT_SWAGGER_PATH;
};

export const configureApplication = (app: INestApplication): void => {
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  if (!isEnabled(process.env.ENABLE_SWAGGER, false)) {
    return;
  }

  const swaggerPath = resolveSwaggerPath(process.env.SWAGGER_PATH);
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Automation API')
    .setDescription('API documentation for AI Automation backend services')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, document, {
    jsonDocumentUrl: `${swaggerPath}-json`,
  });
};
