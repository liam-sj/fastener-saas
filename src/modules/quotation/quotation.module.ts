import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationController } from './quotation.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseRequestModule } from '../purchase-request/purchase-request.module';

@Module({
  imports: [InventoryModule, PurchaseRequestModule],
  controllers: [QuotationController],
  providers: [QuotationService],
  exports: [QuotationService],
})
export class QuotationModule {}
