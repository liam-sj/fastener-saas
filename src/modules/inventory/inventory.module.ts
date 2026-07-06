import { Module } from '@nestjs/common';
import { InboundService } from './inbound.service';
import { InboundController } from './inbound.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';

@Module({
  controllers: [InboundController, DeliveryController],
  providers: [InboundService, DeliveryService],
  exports: [DeliveryService],
})
export class InventoryModule {}
