import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('订单')
@ApiBearerAuth()
@Controller('api/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @ApiOperation({ summary: '分页查询列表' })
  @Get()
  findAll(@Query() query: any) { return this.orderService.findAll(query); }

  @ApiOperation({ summary: '订单利润' })
  @Get(':id/profit')
  getProfit(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.getProfit(id);
  }

  @ApiOperation({ summary: '查询详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.orderService.findOne(id); }

  @ApiOperation({ summary: '创建' })
  @Post()
  create(@Body() dto: CreateOrderDto) { return this.orderService.create(dto); }

  @ApiOperation({ summary: '增项' })
  @Post(':id/items')
  addItem(@Param('id', ParseIntPipe) id: number, @Body() dto: AddItemDto) { return this.orderService.addItem(id, dto); }

  @ApiOperation({ summary: '改项' })
  @Patch(':id/items/:itemId')
  updateItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: UpdateItemDto) {
    return this.orderService.updateItem(id, itemId, dto);
  }

  @ApiOperation({ summary: '减项' })
  @Delete(':id/items/:itemId')
  removeItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Query('reason') reason?: string) {
    return this.orderService.removeItem(id, itemId, reason);
  }

  @ApiOperation({ summary: '更新订单状态' })
  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: string) {
    return this.orderService.updateStatus(id, status);
  }
}
