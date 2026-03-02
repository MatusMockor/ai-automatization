import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import {
  isEnvFlagEnabled,
  normalizeSwaggerPath,
} from '../utils/swagger-config.utils';

const resolveAllowedOrigins = (
  value: string | undefined,
  nodeEnv: string | undefined,
): boolean | string[] => {
  const isProduction = nodeEnv === 'production';
  const parsedOrigins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (parsedOrigins.length === 0) {
    return isProduction ? [] : true;
  }

  const hasWildcard = parsedOrigins.includes('*');
  if (hasWildcard) {
    return isProduction ? [] : true;
  }

  return parsedOrigins;
};

export const configureApplication = (app: INestApplication): void => {
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });
  const allowedOrigins = resolveAllowedOrigins(
    process.env.ALLOWED_ORIGINS,
    process.env.NODE_ENV,
  );
  app.enableCors({
    origin: allowedOrigins,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  if (!isEnvFlagEnabled(process.env.ENABLE_SWAGGER, false)) {
    return;
  }

  const swaggerPath = normalizeSwaggerPath(process.env.SWAGGER_PATH);
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
