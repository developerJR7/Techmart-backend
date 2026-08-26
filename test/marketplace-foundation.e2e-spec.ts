import { PrismaClient } from '@prisma/client';

/**
 * Testes de integridade da fundação do marketplace (Fase 1.1): schema e
 * constraints do banco, não endpoints HTTP — o painel/RBAC de
 * Seller/Store (apply, aprovação, gestão de loja) é Fase 1.2 e ainda
 * não existe, então não há rota para testar "CUSTOMER não pode criar
 * Seller" ou "SELLER não acessa Store de outro" no nível HTTP ainda.
 * Isso é registrado como pendência no relatório desta fase.
 */
describe('Marketplace foundation (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('TechMart Official Store (backfill)', () => {
    it('existe e está APPROVED, com seller representando a plataforma (sem User)', async () => {
      const officialStore = await prisma.store.findUnique({
        where: { slug: 'techmart-official' },
        include: { seller: true },
      });

      expect(officialStore).not.toBeNull();
      expect(officialStore!.seller.status).toBe('APPROVED');
      expect(officialStore!.seller.userId).toBeNull();
    });

    // Checagem puramente referencial (nunca depende de quantos produtos
    // existem no momento): outros arquivos e2e fazem deleteMany() na
    // tabela de produtos como parte do próprio isolamento, então não dá
    // pra afirmar aqui quantos produtos existem — só que, para os que
    // TÊM storeId preenchido, a Store referenciada é sempre real.
    it('todo produto com storeId preenchido aponta pra uma Store real (nunca órfão)', async () => {
      const productsWithOrphanStore = await prisma.product.count({
        where: { storeId: { not: null }, store: null },
      });

      expect(productsWithOrphanStore).toBe(0);
    });
  });

  describe('Seller — ownership (constraints do banco)', () => {
    let testUserId: string;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `seller-ownership-test-${Date.now()}@example.com`,
          name: 'Seller Ownership Test',
          password: 'not-a-real-hash',
        },
      });
      testUserId = user.id;
    });

    afterAll(async () => {
      await prisma.seller.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    });

    it('um usuário só pode ter um Seller (userId único)', async () => {
      await prisma.seller.create({ data: { userId: testUserId } });

      await expect(
        prisma.seller.create({ data: { userId: testUserId } }),
      ).rejects.toThrow();
    });
  });

  describe('Store — ownership (constraints do banco)', () => {
    let sellerAId: string;
    let userAId: string;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `store-ownership-test-${Date.now()}@example.com`,
          name: 'Store Ownership Test',
          password: 'not-a-real-hash',
        },
      });
      userAId = user.id;
      const seller = await prisma.seller.create({
        data: { userId: userAId, status: 'APPROVED' },
      });
      sellerAId = seller.id;
    });

    afterAll(async () => {
      await prisma.store.deleteMany({ where: { sellerId: sellerAId } });
      await prisma.seller.delete({ where: { id: sellerAId } });
      await prisma.user.delete({ where: { id: userAId } });
    });

    it('slug de loja é único', async () => {
      await prisma.store.create({
        data: { sellerId: sellerAId, name: 'Loja A', slug: `loja-teste-${Date.now()}` },
      });

      const dupSlug = await prisma.store.findFirst({ where: { sellerId: sellerAId } });

      await expect(
        prisma.store.create({
          data: { sellerId: sellerAId, name: 'Loja Duplicada', slug: dupSlug!.slug },
        }),
      ).rejects.toThrow();
    });

    it('um Seller só pode ter uma Store (sellerId único)', async () => {
      const existing = await prisma.store.findFirst({ where: { sellerId: sellerAId } });
      expect(existing).not.toBeNull();

      await expect(
        prisma.store.create({
          data: { sellerId: sellerAId, name: 'Segunda Loja', slug: `segunda-loja-${Date.now()}` },
        }),
      ).rejects.toThrow();
    });
  });
});
