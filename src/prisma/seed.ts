import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 开始种子数据...');

  // ────────────────────────────────────────
  // 1. 创建默认租户 + 管理员
  // ────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      name: '紧固件工厂',
      contact: '李总',
      phone: '13800001111',
    },
  });
  console.log(`✅ 租户: ${tenant.name}`);

  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
    },
  });
  console.log('✅ 管理员: admin / admin123');

  // ────────────────────────────────────────
  // 2. 创建客户
  // ────────────────────────────────────────
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: '先锋机械制造有限公司',
        contact: '王工',
        phone: '13900001111',
        address: '上海市浦东新区张江高科技园区',
      },
    }),
    prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: '恒达钢结构工程有限公司',
        contact: '赵经理',
        phone: '13900002222',
        address: '江苏省苏州市工业园区',
      },
    }),
    prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: '远航汽车零部件有限公司',
        contact: '钱工',
        phone: '13900003333',
        address: '浙江省宁波市北仑区',
      },
    }),
  ]);
  console.log(`✅ 客户: ${customers.length} 个`);

  // ────────────────────────────────────────
  // 3. 创建供应商
  // ────────────────────────────────────────
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: '宝钢钢材加工有限公司',
        contact: '孙经理',
        phone: '13800001112',
        address: '上海市宝山区',
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: '精工五金制品有限公司',
        contact: '李销售',
        phone: '13800001113',
        address: '广东省东莞市长安镇',
      },
    }),
  ]);
  console.log(`✅ 供应商: ${suppliers.length} 个`);

  // ────────────────────────────────────────
  // 4. 创建分类 + SPU + SKU
  // ────────────────────────────────────────
  const categoriesData = [
    {
      name: '螺栓',
      specTemplate: { 规格: ['M6', 'M8', 'M10', 'M12', 'M16', 'M20'], 长度: ['10', '15', '20', '25', '30', '35', '40', '45', '50', '60', '80', '100'], 材质: ['碳钢', '不锈钢304', '不锈钢316', '合金钢'], 表面处理: ['镀锌', '发黑', '达克罗', '热镀锌'], 等级: ['4.8', '6.8', '8.8', '10.9', '12.9'] },
    },
    {
      name: '螺钉',
      specTemplate: { 规格: ['M3', 'M4', 'M5', 'M6', 'M8'], 长度: ['6', '8', '10', '12', '16', '20', '25', '30', '40'], 材质: ['碳钢', '不锈钢304', '不锈钢316'], 表面处理: ['镀锌', '发黑', '达克罗'], 头型: ['盘头', '沉头', '半沉头', '六角头'] },
    },
    {
      name: '螺母',
      specTemplate: { 规格: ['M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'], 材质: ['碳钢', '不锈钢304', '不锈钢316', '合金钢'], 表面处理: ['镀锌', '发黑', '达克罗', '热镀锌'], 标准: ['GB6170', 'GB6172', 'DIN934'] },
    },
    {
      name: '垫圈',
      specTemplate: { 规格: ['M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'], 材质: ['碳钢', '不锈钢304', '弹簧钢'], 表面处理: ['镀锌', '发黑', '达克罗'], 类型: ['平垫圈', '弹簧垫圈'] },
    },
    {
      name: '牙条',
      specTemplate: { 规格: ['M6', 'M8', 'M10', 'M12', 'M16', 'M20'], 长度: ['1000', '2000', '3000'], 材质: ['碳钢', '不锈钢304', '不锈钢316', '合金钢'], 表面处理: ['镀锌', '发黑', '热镀锌'] },
    },
  ];

  const categoryAbbreviations: Record<string, string> = {
    螺栓: 'BLT',
    螺钉: 'LD',
    螺母: 'NUT',
    垫圈: 'DQ',
    牙条: 'YT',
  };

  let totalSkus = 0;

  for (const catData of categoriesData) {
    const category = await prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: catData.name,
        specTemplate: catData.specTemplate,
      },
    });

    const abbrev = categoryAbbreviations[catData.name] || catData.name.substring(0, 3).toUpperCase();

    // 每个分类 2-3 个 SPU
    const productDefs = getProductDefs(catData.name);

    for (const pDef of productDefs) {
      const product = await prisma.product.create({
        data: {
          tenantId: tenant.id,
          categoryId: category.id,
          name: pDef.name,
          description: pDef.description,
          images: [],
          tags: pDef.tags || [],
        },
      });

      // 每个 SPU 4-6 个 SKU
      const skuCount = 4 + Math.floor(Math.random() * 3); // 4-6
      for (let i = 0; i < skuCount; i++) {
        const spec = pDef.specs[i % pDef.specs.length];
        const length = spec.length || '';
        const material = spec.material || '碳钢';
        const surface = spec.surface || '镀锌';

        const codeParts = [abbrev];
        if (spec.size) codeParts.push(length ? `${spec.size}x${length}` : spec.size);
        if (material && material !== '碳钢') codeParts.push(material);
        if (surface && surface !== '镀锌') codeParts.push(surface);

        let skuCode = codeParts.join('-');
        // 确保唯一
        const existingCount = await prisma.sku.count({ where: { skuCode, tenantId: tenant.id } });
        if (existingCount > 0) {
          skuCode = `${skuCode}-${i + 1}`;
        }

        await prisma.sku.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            skuCode,
            attributes: spec.attrs,
            price: spec.price,
            stock: 100 + Math.floor(Math.random() * 500), // 100-600
          },
        });
        totalSkus++;
      }
    }
  }
  console.log(`✅ 分类: ${categoriesData.length} 个, SKU: ${totalSkus} 个`);
  console.log('🌱 种子数据完成！');
}

interface SpecDef {
  size: string;
  length?: string;
  material?: string;
  surface?: string;
  attrs: Record<string, string>;
  price: number;
}

interface ProductDef {
  name: string;
  description: string;
  tags: string[];
  specs: SpecDef[];
}

function getProductDefs(categoryName: string): ProductDef[] {
  switch (categoryName) {
    case '螺栓':
      return [
        {
          name: '六角头螺栓',
          description: 'GB/T 5782 六角头螺栓，应用最广泛的紧固件',
          tags: ['六角头', 'GB5782'],
          specs: [
            { size: 'M6', length: '20', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M6', 长度: '20', 材质: '碳钢', 表面处理: '镀锌', 等级: '8.8' }, price: 0.15 },
            { size: 'M8', length: '25', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M8', 长度: '25', 材质: '碳钢', 表面处理: '镀锌', 等级: '8.8' }, price: 0.25 },
            { size: 'M10', length: '30', material: '不锈钢304', surface: '达克罗', attrs: { 规格: 'M10', 长度: '30', 材质: '不锈钢304', 表面处理: '达克罗', 等级: '8.8' }, price: 0.65 },
            { size: 'M12', length: '40', material: '碳钢', surface: '热镀锌', attrs: { 规格: 'M12', 长度: '40', 材质: '碳钢', 表面处理: '热镀锌', 等级: '10.9' }, price: 0.85 },
            { size: 'M16', length: '50', material: '合金钢', surface: '达克罗', attrs: { 规格: 'M16', 长度: '50', 材质: '合金钢', 表面处理: '达克罗', 等级: '12.9' }, price: 1.80 },
          ],
        },
        {
          name: '内六角圆柱头螺栓',
          description: 'GB/T 70.1 内六角圆柱头螺栓，机床模具常用',
          tags: ['内六角', '圆柱头', 'GB70.1'],
          specs: [
            { size: 'M6', length: '16', material: '合金钢', surface: '发黑', attrs: { 规格: 'M6', 长度: '16', 材质: '合金钢', 表面处理: '发黑', 等级: '12.9' }, price: 0.20 },
            { size: 'M8', length: '20', material: '合金钢', surface: '发黑', attrs: { 规格: 'M8', 长度: '20', 材质: '合金钢', 表面处理: '发黑', 等级: '12.9' }, price: 0.35 },
            { size: 'M10', length: '30', material: '不锈钢304', surface: '达克罗', attrs: { 规格: 'M10', 长度: '30', 材质: '不锈钢304', 表面处理: '达克罗', 等级: '12.9' }, price: 0.80 },
            { size: 'M12', length: '35', material: '合金钢', surface: '发黑', attrs: { 规格: 'M12', 长度: '35', 材质: '合金钢', 表面处理: '发黑', 等级: '12.9' }, price: 1.00 },
            { size: 'M16', length: '45', material: '合金钢', surface: '发黑', attrs: { 规格: 'M16', 长度: '45', 材质: '合金钢', 表面处理: '发黑', 等级: '12.9' }, price: 2.00 },
          ],
        },
      ];
    case '螺钉':
      return [
        {
          name: '十字盘头螺钉',
          description: 'GB/T 818 十字槽盘头螺钉',
          tags: ['十字', '盘头', 'GB818'],
          specs: [
            { size: 'M3', length: '8', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M3', 长度: '8', 材质: '碳钢', 表面处理: '镀锌', 头型: '盘头' }, price: 0.05 },
            { size: 'M4', length: '12', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M4', 长度: '12', 材质: '碳钢', 表面处理: '镀锌', 头型: '盘头' }, price: 0.08 },
            { size: 'M5', length: '16', material: '不锈钢304', attrs: { 规格: 'M5', 长度: '16', 材质: '不锈钢304', 头型: '盘头' }, price: 0.18 },
            { size: 'M6', length: '20', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M6', 长度: '20', 材质: '碳钢', 表面处理: '镀锌', 头型: '盘头' }, price: 0.12 },
          ],
        },
        {
          name: '沉头内六角螺钉',
          description: 'GB/T 70.3 沉头内六角螺钉',
          tags: ['沉头', '内六角', 'GB70.3'],
          specs: [
            { size: 'M4', length: '12', material: '合金钢', surface: '发黑', attrs: { 规格: 'M4', 长度: '12', 材质: '合金钢', 表面处理: '发黑', 头型: '沉头' }, price: 0.12 },
            { size: 'M5', length: '16', material: '合金钢', surface: '发黑', attrs: { 规格: 'M5', 长度: '16', 材质: '合金钢', 表面处理: '发黑', 头型: '沉头' }, price: 0.18 },
            { size: 'M6', length: '20', material: '不锈钢304', attrs: { 规格: 'M6', 长度: '20', 材质: '不锈钢304', 头型: '沉头' }, price: 0.35 },
            { size: 'M8', length: '25', material: '合金钢', surface: '发黑', attrs: { 规格: 'M8', 长度: '25', 材质: '合金钢', 表面处理: '发黑', 头型: '沉头' }, price: 0.40 },
          ],
        },
      ];
    case '螺母':
      return [
        {
          name: '六角螺母',
          description: 'GB/T 6170 六角螺母，最常用螺母类型',
          tags: ['六角', 'GB6170'],
          specs: [
            { size: 'M6', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M6', 材质: '碳钢', 表面处理: '镀锌', 标准: 'GB6170' }, price: 0.05 },
            { size: 'M8', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M8', 材质: '碳钢', 表面处理: '镀锌', 标准: 'GB6170' }, price: 0.08 },
            { size: 'M10', material: '不锈钢304', attrs: { 规格: 'M10', 材质: '不锈钢304', 标准: 'GB6170' }, price: 0.25 },
            { size: 'M12', material: '碳钢', surface: '热镀锌', attrs: { 规格: 'M12', 材质: '碳钢', 表面处理: '热镀锌', 标准: 'GB6170' }, price: 0.18 },
            { size: 'M16', material: '合金钢', surface: '达克罗', attrs: { 规格: 'M16', 材质: '合金钢', 表面处理: '达克罗', 标准: 'GB6170' }, price: 0.45 },
          ],
        },
        {
          name: '法兰螺母',
          description: 'GB/T 6177 法兰面螺母，自带垫圈效果',
          tags: ['法兰', 'GB6177'],
          specs: [
            { size: 'M6', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M6', 材质: '碳钢', 表面处理: '镀锌', 标准: 'GB6177' }, price: 0.10 },
            { size: 'M8', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M8', 材质: '碳钢', 表面处理: '镀锌', 标准: 'GB6177' }, price: 0.15 },
            { size: 'M10', material: '不锈钢304', attrs: { 规格: 'M10', 材质: '不锈钢304', 标准: 'GB6177' }, price: 0.35 },
            { size: 'M12', material: '碳钢', surface: '达克罗', attrs: { 规格: 'M12', 材质: '碳钢', 表面处理: '达克罗', 标准: 'GB6177' }, price: 0.30 },
          ],
        },
      ];
    case '垫圈':
      return [
        {
          name: '平垫圈',
          description: 'GB/T 97.1 平垫圈，保护工件表面',
          tags: ['平垫圈', 'GB97.1'],
          specs: [
            { size: 'M6', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M6', 材质: '碳钢', 表面处理: '镀锌', 类型: '平垫圈' }, price: 0.02 },
            { size: 'M8', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M8', 材质: '碳钢', 表面处理: '镀锌', 类型: '平垫圈' }, price: 0.03 },
            { size: 'M10', material: '不锈钢304', attrs: { 规格: 'M10', 材质: '不锈钢304', 类型: '平垫圈' }, price: 0.08 },
            { size: 'M12', material: '碳钢', surface: '达克罗', attrs: { 规格: 'M12', 材质: '碳钢', 表面处理: '达克罗', 类型: '平垫圈' }, price: 0.06 },
            { size: 'M16', material: '碳钢', surface: '热镀锌', attrs: { 规格: 'M16', 材质: '碳钢', 表面处理: '热镀锌', 类型: '平垫圈' }, price: 0.12 },
          ],
        },
        {
          name: '弹簧垫圈',
          description: 'GB/T 93 弹簧垫圈，防松作用',
          tags: ['弹簧垫圈', 'GB93'],
          specs: [
            { size: 'M6', material: '弹簧钢', attrs: { 规格: 'M6', 材质: '弹簧钢', 类型: '弹簧垫圈' }, price: 0.03 },
            { size: 'M8', material: '弹簧钢', attrs: { 规格: 'M8', 材质: '弹簧钢', 类型: '弹簧垫圈' }, price: 0.05 },
            { size: 'M10', material: '弹簧钢', attrs: { 规格: 'M10', 材质: '弹簧钢', 类型: '弹簧垫圈' }, price: 0.07 },
            { size: 'M12', material: '弹簧钢', attrs: { 规格: 'M12', 材质: '弹簧钢', 类型: '弹簧垫圈' }, price: 0.10 },
          ],
        },
      ];
    case '牙条':
      return [
        {
          name: '全螺纹牙条',
          description: 'DIN 976 全螺纹牙条，长度可裁切',
          tags: ['全螺纹', 'DIN976'],
          specs: [
            { size: 'M6', length: '1000', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M6', 长度: '1000', 材质: '碳钢', 表面处理: '镀锌' }, price: 3.50 },
            { size: 'M8', length: '1000', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M8', 长度: '1000', 材质: '碳钢', 表面处理: '镀锌' }, price: 5.00 },
            { size: 'M10', length: '1000', material: '不锈钢304', attrs: { 规格: 'M10', 长度: '1000', 材质: '不锈钢304' }, price: 15.00 },
            { size: 'M12', length: '2000', material: '碳钢', surface: '热镀锌', attrs: { 规格: 'M12', 长度: '2000', 材质: '碳钢', 表面处理: '热镀锌' }, price: 18.00 },
            { size: 'M16', length: '2000', material: '合金钢', surface: '达克罗', attrs: { 规格: 'M16', 长度: '2000', 材质: '合金钢', 表面处理: '达克罗' }, price: 35.00 },
          ],
        },
        {
          name: '双头牙条',
          description: 'DIN 975 双头牙条',
          tags: ['双头', 'DIN975'],
          specs: [
            { size: 'M8', length: '1000', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M8', 长度: '1000', 材质: '碳钢', 表面处理: '镀锌' }, price: 6.00 },
            { size: 'M10', length: '1000', material: '碳钢', surface: '镀锌', attrs: { 规格: 'M10', 长度: '1000', 材质: '碳钢', 表面处理: '镀锌' }, price: 8.50 },
            { size: 'M12', length: '2000', material: '不锈钢316', attrs: { 规格: 'M12', 长度: '2000', 材质: '不锈钢316' }, price: 45.00 },
            { size: 'M16', length: '3000', material: '碳钢', surface: '热镀锌', attrs: { 规格: 'M16', 长度: '3000', 材质: '碳钢', 表面处理: '热镀锌' }, price: 30.00 },
          ],
        },
      ];
    default:
      return [];
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
