import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Namespace desta suite dentro do Postgres compartilhado entre os arquivos
// .e2e-spec.ts (ver nota em products.e2e-spec.ts) — nunca usar deleteMany()
// sem filtro.
const NS = 'orders-e2e';

jest.setTimeout(30000);

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let userAId: string;
  let userCId: string;

  let addressAId: string;
  let addressCId: string;
  let productId: string;
  let productPrice: number;

  const register = async (email: string, name: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Test123!@#', name });
    return {
      token: res.body.accessToken as string,
      id: res.body.user.id as string,
    };
  };

  const cleanup = async () => {
    await prisma.orderItem.deleteMany({
      where: { order: { user: { email: { contains: NS } } } },
    });
    await prisma.payment.deleteMany({
      where: { order: { user: { email: { contains: NS } } } },
    });
    await prisma.order.deleteMany({
      where: { user: { email: { contains: NS } } },
    });
    await prisma.address.deleteMany({
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
      data: { name: `Orders Category ${NS}`, slug: `orders-category-${NS}` },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Produto para pedidos',
        slug: `produto-pedidos-${NS}`,
        description: 'desc',
        price: 100,
        stock: 50,
        categoryId: category.id,
      },
    });
    productId = product.id;
    productPrice = 100;

    const userA = await register(`user-a-${NS}@example.com`, 'User A');
    tokenA = userA.token;
    userAId = userA.id;

    const userB = await register(`user-b-${NS}@example.com`, 'User B');
    tokenB = userB.token;

    const userC = await register(`user-c-${NS}@example.com`, 'User C');
    tokenC = userC.token;
    userCId = userC.id;

    // Endereço real de A, no formato completo (street/number/neighborhood/
    // city/state/zipCode/complement) — exercita a migration adicionada
    // nesta fase (Address ganhou number/neighborhood/complement).
    const addressRes = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        street: 'Rua Teste',
        number: '123',
        neighborhood: 'Centro',
        complement: 'Apto 1',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01000-000',
      });
    addressAId = addressRes.body.id;

    const addressCRes = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({
        street: 'Rua de C',
        number: '456',
        neighborhood: 'Bairro C',
        city: 'Rio de Janeiro',
        state: 'RJ',
        zipCode: '02000-000',
      });
    addressCId = addressCRes.body.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  describe('autenticação', () => {
    it('POST /orders sem token → 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({})
        .expect(401);
    });
  });

  describe('criação de pedido — contrato correto (addressId + items + shippingCost)', () => {
    // As 3 páginas de checkout (PIX, boleto, cartão) montam exatamente este
    // mesmo payload para POST /orders — o método de pagamento só entra
    // depois, numa chamada separada a /payments/*. Testado 3x para deixar
    // explícita a cobertura dos 3 fluxos, embora a chamada ao backend seja
    // idêntica nos três.
    const validPayload = () => ({
      items: [{ productId, quantity: 1 }],
      addressId: addressAId,
      shippingCost: 15,
    });

    it('cria pedido com sucesso (fluxo PIX)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(validPayload())
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      expect(Number(res.body.total)).toBe(productPrice + 15);
      expect(res.body.address.id).toBe(addressAId);
      // Nenhum Payment foi criado ainda nesta etapa — a relação existe mas
      // está vazia até o cliente chamar /payments/pix separadamente.
      expect(res.body.payment).toBeNull();
    });

    it('cria pedido com sucesso (fluxo boleto)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(validPayload())
        .expect(201);

      expect(res.body.status).toBe('PENDING');
    });

    it('cria pedido com sucesso (fluxo cartão)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(validPayload())
        .expect(201);

      expect(res.body.status).toBe('PENDING');
    });

    it('não permite usar addressId de outro usuário', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ ...validPayload(), addressId: addressAId })
        .expect(404);
    });
  });

  describe('criação de pedido — payload antigo continua rejeitado (regressão)', () => {
    // Formato que o frontend enviava antes desta fase: shippingAddress
    // inline + paymentMethod + couponCode, sem addressId nem shippingCost.
    // Reproduzido em runtime nesta sessão como o bug raiz do checkout —
    // este teste existe pra nunca mais voltar a passar despercebido.
    it('payload antigo (shippingAddress/paymentMethod/couponCode) → 400', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          items: [{ productId, quantity: 1 }],
          shippingAddress: {
            street: 'Rua Teste',
            number: '123',
            neighborhood: 'Centro',
            city: 'São Paulo',
            state: 'SP',
            zipCode: '01000-000',
          },
          paymentMethod: 'PIX',
          couponCode: undefined,
        })
        .expect(400);
    });

    it('sem addressId → 400', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ items: [{ productId, quantity: 1 }], shippingCost: 0 })
        .expect(400);
    });
  });

  describe('GET /orders — paginado e escopado ao próprio usuário', () => {
    it('retorna {data, meta} só com os pedidos do usuário autenticado', async () => {
      // userC nunca aparece em nenhum outro describe desta suite — os 2
      // pedidos abaixo são a totalidade dos pedidos dele, o que permite
      // afirmar um total exato sem interferência de outros testes.
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${tokenC}`)
          .send({
            items: [{ productId, quantity: 1 }],
            addressId: addressCId,
            shippingCost: 0,
          })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenC}`)
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      expect(res.body.data).toHaveLength(2);
      expect(
        res.body.data.every((o: { userId: string }) => o.userId === userCId),
      ).toBe(true);
    });

    it('pedidos de C não vazam na listagem de A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(
        res.body.data.every((o: { userId: string }) => o.userId === userAId),
      ).toBe(true);
    });
  });

  describe('cancelamento', () => {
    let orderAId: string;
    let stockBefore: number;

    beforeEach(async () => {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      stockBefore = product!.stock;

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          items: [{ productId, quantity: 2 }],
          addressId: addressAId,
          shippingCost: 0,
        })
        .expect(201);
      orderAId = res.body.id;
    });

    it('usuário B não pode cancelar pedido do usuário A (404, não 200)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderAId}/cancel`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      const order = await prisma.order.findUnique({ where: { id: orderAId } });
      expect(order!.status).toBe('PENDING');
    });

    it('pedido em status não cancelável (SHIPPED) não pode ser cancelado', async () => {
      await prisma.order.update({
        where: { id: orderAId },
        data: { status: 'SHIPPED' },
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderAId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });

    it('pedido cancelável é cancelado e o estoque dos itens é devolvido', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderAId}/cancel`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      // stockBefore foi lido ANTES do beforeEach criar o pedido (que já
      // decrementou 2). Criar + cancelar deve ser um ciclo neutro: o
      // estoque volta exatamente ao valor de antes da compra.
      expect(product!.stock).toBe(stockBefore);
    });
  });

  describe('consistência Order ↔ Payment', () => {
    it('order.payment.method reflete o enum real (CARD/PIX/BOLETO), não um valor inventado no frontend', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          items: [{ productId, quantity: 1 }],
          addressId: addressAId,
          shippingCost: 0,
        })
        .expect(201);

      const orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post('/api/v1/payments/pix')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ orderId, amount: productPrice })
        .expect(201);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(getRes.body.payment).not.toBeNull();
      expect(getRes.body.payment.method).toBe('PIX');
      expect(getRes.body.payment.method).not.toBe('CREDIT_CARD');
    });
  });
});
