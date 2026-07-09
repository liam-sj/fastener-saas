-- ============================================================
-- 迁移 1/2: 仅扩展枚举值
-- ALTER TYPE ADD VALUE 在 PostgreSQL 事务内不能立即使用新值,
-- 因此必须单独迁移,确保第二个迁移文件可以安全引用这些新值。
-- ============================================================

-- QuotationStatus 新增 superseded
ALTER TYPE "QuotationStatus" ADD VALUE 'superseded';

-- OrderStatus 新增 accepted / sourcing / producing / ready_to_ship
ALTER TYPE "OrderStatus" ADD VALUE 'accepted';
ALTER TYPE "OrderStatus" ADD VALUE 'sourcing';
ALTER TYPE "OrderStatus" ADD VALUE 'producing';
ALTER TYPE "OrderStatus" ADD VALUE 'ready_to_ship';
