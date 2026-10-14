import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './env.js';

export interface AppConfigOptions {
  envFilePath: string[];
}

@Module({})
export class AppConfigModule {
  static forRoot(options: AppConfigOptions): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          envFilePath: options.envFilePath,
          validate: parseEnv,
        }),
      ],
    };
  }
}
