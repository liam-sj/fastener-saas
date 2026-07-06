import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { ReconcileDto } from './dto/reconcile.dto';
import { QuerySummaryDto } from './dto/query-summary.dto';

@Controller('api/settlements')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get('order/:orderId')
  findByOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.settlementService.findByOrder(orderId);
  }

  @Get('summary')
  getSummary(@Query() query: QuerySummaryDto) {
    return this.settlementService.getSummary(query);
  }

  @Post('reconcile')
  reconcile(@Body() dto: ReconcileDto) {
    return this.settlementService.reconcile(dto);
  }
}
