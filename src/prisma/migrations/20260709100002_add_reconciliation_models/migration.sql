-- ============================================================
-- 迁移 2/2: 新增表 + 现有表加列 + 数据迁移 + 外键
-- 此时迁移 1 的枚举值已提交可用
-- ============================================================

-- 1. 新增枚举类型
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('pending', 'quoting', 'quoted', 'accepted', 'rejected', 'cancelled');
CREATE TYPE "ProductionOrderStatus" AS ENUM ('planning', 'in_progress', 'partial_done', 'done', 'cancelled');
CREATE TYPE "ProcessStepStatus" AS ENUM ('pending', 'in_progress', 'done', 'skipped');
CREATE TYPE "ProcessStage" AS ENUM ('preparation', 'forming', 'threading', 'post_treatment');
CREATE TYPE "ProcessStepType" AS ENUM ('feeding', 'turning', 'milling', 'grinding', 'drilling', 'rolling', 'heat_treatment', 'surface_treatment');
CREATE TYPE "ProcessStepMethod" AS ENUM ('self', 'outsource');
CREATE TYPE "PurchasePurpose" AS ENUM ('material', 'outsource', 'finished_goods');

-- 2. 新增表

CREATE TABLE "purchase_requests" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "requestNo" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'pending',
    "expectedDate" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_requests_requestNo_key" ON "purchase_requests"("requestNo");
CREATE INDEX "purchase_requests_tenantId_createdAt_idx" ON "purchase_requests"("tenantId", "createdAt");
CREATE INDEX "purchase_requests_tenantId_status_idx" ON "purchase_requests"("tenantId", "status");

CREATE TABLE "purchase_request_items" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "purchaseRequestId" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "specText" TEXT,
    "attributes" JSONB,
    "qty" INTEGER NOT NULL,
    "targetPrice" DECIMAL(10,2),
    "skuId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_request_items_tenantId_purchaseRequestId_idx" ON "purchase_request_items"("tenantId", "purchaseRequestId");

CREATE TABLE "production_orders" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "productionNo" TEXT NOT NULL,
    "orderItemId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "completedQty" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'planning',
    "plannedFinishDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "production_orders_productionNo_key" ON "production_orders"("productionNo");
CREATE UNIQUE INDEX "production_orders_orderItemId_key" ON "production_orders"("orderItemId");
CREATE INDEX "production_orders_tenantId_createdAt_idx" ON "production_orders"("tenantId", "createdAt");
CREATE INDEX "production_orders_tenantId_status_idx" ON "production_orders"("tenantId", "status");

CREATE TABLE "process_steps" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "productionOrderId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" "ProcessStage" NOT NULL,
    "stepType" "ProcessStepType" NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProcessStepMethod" NOT NULL DEFAULT 'self',
    "supplierId" INTEGER,
    "purchaseOrderId" INTEGER,
    "surfaceMethod" TEXT,
    "status" "ProcessStepStatus" NOT NULL DEFAULT 'pending',
    "plannedQty" INTEGER NOT NULL DEFAULT 0,
    "actualQty" INTEGER NOT NULL DEFAULT 0,
    "lossQty" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "process_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "process_steps_productionOrderId_sequence_key" ON "process_steps"("productionOrderId", "sequence");
CREATE INDEX "process_steps_tenantId_productionOrderId_idx" ON "process_steps"("tenantId", "productionOrderId");
CREATE INDEX "process_steps_tenantId_status_idx" ON "process_steps"("tenantId", "status");

-- 3. 现有表新增字段
ALTER TABLE "quotations" ADD COLUMN "purchaseRequestId" INTEGER;
ALTER TABLE "quotations" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "quotations_purchaseRequestId_version_key" ON "quotations"("purchaseRequestId", "version");

ALTER TABLE "orders" ADD COLUMN "purchaseRequestId" INTEGER;

ALTER TABLE "purchase_orders" ADD COLUMN "purpose" "PurchasePurpose" NOT NULL DEFAULT 'finished_goods';
ALTER TABLE "purchase_orders" ADD COLUMN "orderItemId" INTEGER;
ALTER TABLE "purchase_orders" ADD COLUMN "processStepId" INTEGER;
ALTER TABLE "purchase_orders" ADD COLUMN "productionOrderId" INTEGER;
CREATE INDEX "purchase_orders_tenantId_purpose_idx" ON "purchase_orders"("tenantId", "purpose");

-- 4. 数据迁移: orders.status 'pending' -> 'accepted'
UPDATE "orders" SET "status" = 'accepted' WHERE "status" = 'pending';

-- 5. 外键约束
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_processStepId_fkey" FOREIGN KEY ("processStepId") REFERENCES "process_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
