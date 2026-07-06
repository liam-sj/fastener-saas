import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Controller('api/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  findAll(@Query() query: any) { return this.orderService.findAll(query); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.orderService.findOne(id); }

  @Post()
  create(@Body() dto: CreateOrderDto) { return this.orderService.create(dto); }

  @Post(':id/items')
  addItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddItemDto) { return this.orderService.addItem(id, dto); }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: UpdateItemDto) {
    return this.orderService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Query('reason') reason?: string) {
    return this.orderService.removeItem(id, itemId, reason);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: string) {
    return this.orderService.updateStatus(id, status);
  }
}
