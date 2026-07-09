import { IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class DeliveryItemDto {
  @ApiProperty({ description: '订单条目ID' })
  @IsInt()
  orderItemId: number;
  @ApiProperty({ description: '数量' })
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateDeliveryDto {
  @ApiProperty({ description: '订单ID' })
  @IsInt()
  orderId: number;
  @ApiProperty({ description: '条目列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryItemDto)
  items: DeliveryItemDto[];
}
