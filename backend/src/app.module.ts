import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

const toBoolean = (
  value: string | undefined,
  defaultValue: boolean,
): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const dbType = config.get<string>('DB_TYPE', 'postgres');

        if (dbType === 'sqljs') {
          return {
            type: 'sqljs',
            autoLoadEntities: true,
            autoSave: false,
            location: config.get('DB_SQLJS_LOCATION', '/tmp/ai-automation.db'),
            synchronize: toBoolean(config.get<string>('DB_SYNCHRONIZE'), true),
            migrationsRun: false,
          };
        }

        return {
          type: 'postgres',
          host: config.get('DB_HOST', 'localhost'),
          port: parseInt(config.get('DB_PORT', '5432'), 10),
          username: config.get('DB_USERNAME', 'ai_automation'),
          password: config.get('DB_PASSWORD', 'ai_automation_secret'),
          database: config.get('DB_DATABASE', 'ai_automation_db'),
          autoLoadEntities: true,
          synchronize: toBoolean(config.get<string>('DB_SYNCHRONIZE'), false),
          migrationsRun: toBoolean(
            config.get<string>('DB_MIGRATIONS_RUN'),
            true,
          ),
          migrations: [join(__dirname, 'database', 'migrations', '*{.ts,.js}')],
        };
      },
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
