import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { ReconcileDto } from './dto/reconcile.dto';
import { QuerySummaryDto } from './dto/query-summary.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('对账')
@ApiBearerAuth()
@Controller('api/settlements')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @ApiOperation({ summary: '查询订单对账' })
  @Get('order/:orderId')
  findByOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.settlementService.findByOrder(orderId);
  }

  @ApiOperation({ summary: '查询汇总' })
  @Get('summary')
  getSummary(@Query() query: QuerySummaryDto) {
    return this.settlementService.getSummary(query);
  }

  @ApiOperation({ summary: '确认收款' })
  @Post('reconcile')
  reconcile(@Body() dto: ReconcileDto) {
    return this.settlementService.reconcile(dto);
  }
}
