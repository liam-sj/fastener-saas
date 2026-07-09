import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ShipDto } from './dto/ship.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('发货单')
@ApiBearerAuth()
@Controller('api/delivery-orders')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @ApiOperation({ summary: '分页查询列表' })
  @Get()
  findAll(@Query() query: any) {
    return this.deliveryService.findAll(query);
  }

  @ApiOperation({ summary: '查询详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryService.findOne(id);
  }

  @ApiOperation({ summary: '创建' })
  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: CreateDeliveryDto) {
    return this.deliveryService.create(dto);
  }

  @ApiOperation({ summary: '发货' })
  @Roles('admin', 'manager')
  @Patch(':id/ship')
  ship(@Param('id', ParseIntPipe) id: number, @Body() dto: ShipDto) {
    return this.deliveryService.ship(id, dto);
  }

  @ApiOperation({ summary: '签收' })
  @Roles('admin', 'manager')
  @Patch(':id/sign')
  sign(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryService.sign(id);
  }
}
