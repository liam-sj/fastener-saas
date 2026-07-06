import { IsNumber, IsArray, ValidateNested, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReconcileItemDto {
  @ApiProperty({ description: '订单条目ID' })
  @IsNumber()
  orderItemId: number;

  @ApiProperty({ description: '金额' })
  @IsNumber()
  amount: number;
}

export class ReconcileDto {
  @ApiProperty({ description: '订单ID' })
  @IsNumber()
  orderId: number;

  @ApiProperty({ description: '条目列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconcileItemDto)
  items: ReconcileItemDto[];

  @ApiPropertyOptional({ description: '收款时间' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
