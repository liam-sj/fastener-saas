import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationController } from './quotation.controller';

@Module({ controllers: [QuotationController], providers: [QuotationService], exports: [QuotationService] })
export class QuotationModule {}
