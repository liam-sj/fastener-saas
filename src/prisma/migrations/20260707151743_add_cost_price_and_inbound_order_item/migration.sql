/*
  Warnings:

  - You are about to drop the column `items` on the `inbound_orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "inbound_orders" DROP COLUMN "items";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "costPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "skus" ADD COLUMN     "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "inbound_order_items" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "inboundOrderId" INTEGER NOT NULL,
    "purchaseOrderItemId" INTEGER,
    "skuCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "skuAttrs" JSONB,
    "qty" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_order_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_inboundOrderId_fkey" FOREIGN KEY ("inboundOrderId") REFERENCES "inbound_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
