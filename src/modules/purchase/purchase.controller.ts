import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Controller('api/purchase-orders')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Get()
  findAll(@Query() query: any) { return this.purchaseService.findAll(query); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.purchaseService.findOne(id); }

  @Post()
  create(@Body() dto: CreatePurchaseDto) { return this.purchaseService.create(dto); }

  @Post('from-order/:orderId')
  generateFromOrder(@Param('orderId', ParseIntPipe) orderId: number) { return this.purchaseService.generateFromOrder(orderId); }

  @Patch(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number) { return this.purchaseService.confirm(id); }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: string) { return this.purchaseService.updateStatus(id, status); }
}
