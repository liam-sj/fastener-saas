import { plainToInstance } from 'class-transformer';
import { IsString, MinLength, IsOptional, IsInt, validateSync } from 'class-validator';

class EnvConfig {
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  SWAGGER_ENABLED?: string;
}

export function validateEnv(): void {
  const config = plainToInstance(EnvConfig, process.env, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => {
        const constraints = e.constraints ? Object.values(e.constraints).join(', ') : 'unknown';
        return `  - ${e.property}: ${constraints}`;
      })
      .join('\n');
    throw new Error(`环境变量校验失败，进程退出:\n${messages}`);
  }
}
