import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Namespace desta suite dentro do Postgres compartilhado entre os arquivos
// .e2e-spec.ts (ver nota em products.e2e-spec.ts) — nunca usar deleteMany()
// sem filtro.
const NS = 'cart-e2e';

describe('Cart (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let categoryId: string;
  let productId: string;
  let outOfStockProductId: string;

  const cleanup = async () => {
    await prisma.cartItem.deleteMany({
      where: { cart: { user: { email: { contains: NS } } } },
    });
    await prisma.cart.deleteMany({
      where: { user: { email: { contains: NS } } },
    });
    await prisma.product.deleteMany({
      where: { category: { slug: { contains: NS } } },
    });
    await prisma.category.deleteMany({ where: { slug: { contains: NS } } });
    await prisma.user.deleteMany({ where: { email: { contains: NS } } });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    await cleanup();

    const category = await prisma.category.create({
      data: { name: `Cart Category ${NS}`, slug: `cart-category-${NS}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: 'Produto com estoque',
        slug: `produto-com-estoque-${NS}`,
        description: 'desc',
        price: 50,
        stock: 3,
        categoryId,
      },
    });
    productId = product.id;

    const outOfStockProduct = await prisma.product.create({
      data: {
        name: 'Produto sem estoque',
        slug: `produto-sem-estoque-${NS}`,
        description: 'desc',
        price: 50,
        stock: 0,
        categoryId,
      },
    });
    outOfStockProductId = outOfStockProduct.id;

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `user-a-${NS}@example.com`,
        password: 'Test123!@#',
        name: 'User A',
      });
    tokenA = registerA.body.accessToken;
    userAId = registerA.body.user.id;

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `user-b-${NS}@example.com`,
        password: 'Test123!@#',
        name: 'User B',
      });
    tokenB = registerB.body.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(async () => {
    // Isola cada teste sem recriar app/usuários — só zera o conteúdo dos
    // carrinhos dos dois usuários de teste entre um `it` e outro.
    await prisma.cartItem.deleteMany({
      where: { cart: { user: { email: { contains: NS } } } },
    });
  });

  describe('autenticação', () => {
    it('GET /cart sem token → 401', () => {
      return request(app.getHttpServer()).get('/api/v1/cart').expect(401);
    });

    it('POST /cart/items sem token → 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .send({ productId, quantity: 1 })
        .expect(401);
    });
  });

  describe('fluxo funcional', () => {
    it('carrinho vazio recém-criado', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.subtotal).toBe(0);
      expect(res.body.itemCount).toBe(0);
    });

    it('adiciona item e o subtotal reflete o preço real do produto (não um valor do cliente)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 2 })
        .expect(201);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.itemCount).toBe(2);
      expect(res.body.subtotal).toBe(100); // 2 * 50, preço real do produto
    });

    it('adicionar o mesmo produto de novo incrementa a quantidade existente', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].quantity).toBe(2);
    });

    it('atualiza quantidade de um item', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${productId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ quantity: 3 })
        .expect(200);

      expect(res.body.items[0].quantity).toBe(3);
    });

    it('remove um item', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${productId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
    });

    it('limpa o carrinho inteiro', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
    });
  });

  describe('validação', () => {
    it('rejeita quantidade zero', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 0 })
        .expect(400);
    });

    it('rejeita quantidade negativa', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: -1 })
        .expect(400);
    });

    it('rejeita productId ausente', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ quantity: 1 })
        .expect(400);
    });

    it('rejeita produto inexistente', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: 'non-existent-id', quantity: 1 })
        .expect(404);
    });

    it('rejeita quando não há estoque suficiente', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId: outOfStockProductId, quantity: 1 })
        .expect(400);
    });

    it('POST /cart/merge com quantidade negativa é rejeitado pelo DTO (não passa direto pro service)', () => {
      // Regressão: MergeCartDto envelopa AddToCartDto[] com @ValidateNested
      // porque o ValidationPipe global do Nest pula validação de arrays no
      // nível raiz do body — sem o envelope, quantity negativa passaria.
      return request(app.getHttpServer())
        .post('/api/v1/cart/merge')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ items: [{ productId, quantity: -100 }] })
        .expect(400);
    });

    it('POST /cart/merge com body em formato antigo (array cru) é rejeitado (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/cart/merge')
        .set('Authorization', `Bearer ${tokenA}`)
        .send([{ productId, quantity: 1 }])
        .expect(400);
    });
  });

  describe('segurança — ownership entre usuários (IDOR)', () => {
    it('usuário B não vê itens do carrinho do usuário A', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
    });

    it('usuário B não consegue atualizar item do carrinho do usuário A (404, não 200)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${productId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ quantity: 5 })
        .expect(404);

      // Confirma que o item de A não foi alterado por B.
      const cartA = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(cartA.body.items[0].quantity).toBe(1);
    });

    it('usuário B não consegue remover item do carrinho do usuário A (404)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${productId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      const cartA = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(cartA.body.items).toHaveLength(1);
    });

    it('usuário B limpando o próprio carrinho não afeta o carrinho de A', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const cartA = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(cartA.body.items).toHaveLength(1);
    });

    it('DTO não aceita userId no body — mass assignment é barrado pelo whitelist do ValidationPipe global', () => {
      // AddToCartDto só declara productId/quantity; forbidNonWhitelisted
      // rejeita qualquer campo extra, então nem chega a existir um caminho
      // onde um userId de body seria considerado.
      return request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ productId, quantity: 1, userId: userAId })
        .expect(400);
    });

    it('identidade do carrinho vem sempre do JWT, nunca de um parâmetro do cliente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ productId, quantity: 1 })
        .expect(201);

      // O item foi adicionado ao carrinho de quem está autenticado (B),
      // identificado só pelo JWT (CurrentUser -> request.user.id).
      expect(res.body.userId).not.toBe(userAId);

      const cartB = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(cartB.body.items).toHaveLength(1);
    });
  });
});
