import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ShipDto } from './dto/ship.dto';

@Controller('api/delivery-orders')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get()
  findAll(@Query() query: any) { return this.deliveryService.findAll(query); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.deliveryService.findOne(id); }

  @Post()
  create(@Body() dto: CreateDeliveryDto) { return this.deliveryService.create(dto); }

  @Patch(':id/ship')
  ship(@Param('id', ParseIntPipe) id: number, @Body() dto: ShipDto) { return this.deliveryService.ship(id, dto); }

  @Patch(':id/sign')
  sign(@Param('id', ParseIntPipe) id: number) { return this.deliveryService.sign(id); }
}
