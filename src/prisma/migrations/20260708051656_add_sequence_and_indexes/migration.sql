-- CreateTable
CREATE TABLE "sequences" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "dateStr" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sequences_tenantId_prefix_dateStr_key" ON "sequences"("tenantId", "prefix", "dateStr");

-- CreateIndex
CREATE INDEX "delivery_orders_tenantId_createdAt_idx" ON "delivery_orders"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "inbound_orders_tenantId_createdAt_idx" ON "inbound_orders"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "order_items_tenantId_orderId_idx" ON "order_items"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "order_items_tenantId_skuCode_idx" ON "order_items"("tenantId", "skuCode");

-- CreateIndex
CREATE INDEX "orders_tenantId_createdAt_idx" ON "orders"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_tenantId_status_idx" ON "orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "orders_tenantId_customerId_idx" ON "orders"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_createdAt_idx" ON "purchase_orders"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_supplierId_idx" ON "purchase_orders"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "quotations_tenantId_createdAt_idx" ON "quotations"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "skus_tenantId_skuCode_idx" ON "skus"("tenantId", "skuCode");

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
