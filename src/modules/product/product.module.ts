import { Module } from '@nestjs/common';
import { CategoryModule } from './category.module';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { SkuService } from './sku.service';
import { SkuController } from './sku.controller';

@Module({
  imports: [CategoryModule],
  controllers: [ProductController, SkuController],
  providers: [ProductService, SkuService],
  exports: [ProductService, SkuService],
})
export class ProductModule {}
