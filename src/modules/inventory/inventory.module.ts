import { Module } from '@nestjs/common';
import { InboundService } from './inbound.service';
import { InboundController } from './inbound.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { StockService } from './stock.service';

@Module({
  controllers: [InboundController, DeliveryController],
  providers: [InboundService, DeliveryService, StockService],
  exports: [DeliveryService, StockService],
})
export class InventoryModule {}
