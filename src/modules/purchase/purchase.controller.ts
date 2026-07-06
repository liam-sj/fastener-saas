import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('采购单')
@ApiBearerAuth()
@Controller('api/purchase-orders')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @ApiOperation({ summary: '分页查询列表' })
  @Get()
  findAll(@Query() query: any) { return this.purchaseService.findAll(query); }

  @ApiOperation({ summary: '查询详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.purchaseService.findOne(id); }

  @ApiOperation({ summary: '创建' })
  @Post()
  create(@Body() dto: CreatePurchaseDto) { return this.purchaseService.create(dto); }

  @ApiOperation({ summary: '从订单生成采购单' })
  @Post('from-order/:orderId')
  generateFromOrder(@Param('orderId', ParseIntPipe) orderId: number) { return this.purchaseService.generateFromOrder(orderId); }

  @ApiOperation({ summary: '确认入库' })
  @Patch(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number) { return this.purchaseService.confirm(id); }

  @ApiOperation({ summary: '更新采购单状态' })
  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: string) { return this.purchaseService.updateStatus(id, status); }
}
