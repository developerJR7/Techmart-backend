import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Namespace desta suite dentro do Postgres compartilhado entre todos os
// arquivos .e2e-spec.ts no mesmo job de CI (ver docs/e2e-isolation.md).
// Nunca usar deleteMany() sem filtro aqui — outra suite pode ter dados
// reais na mesma tabela no momento em que este arquivo roda (a ordem dos
// arquivos não é alfabética nem fixa, ver nota no topo de products.e2e-spec).
const NS = 'products-e2e';

describe('Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let categoryId: string;

  const cleanup = async () => {
    // Ordem importa: products.categoryId -> categories.id é ON DELETE
    // RESTRICT (ver migration 20251125024555_init), então a categoria só
    // pode ser removida depois dos produtos que apontam pra ela.
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

    // Replica o setup relevante de main.ts (prefixo global + validação),
    // já que o bootstrap real só roda em bootstrap(), não no AppModule.
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

    // Defensivo: limpa resíduo de uma execução anterior que tenha
    // crashado antes do próprio afterAll (mesmo padrão usado em
    // seller-onboarding/seller-store.e2e-spec.ts).
    await cleanup();

    // Categoria própria desta suite, criada antes de qualquer teste — os
    // testes de listagem filtram por ela via ?categoryId=, nunca leem o
    // catálogo inteiro (que pode ter produtos de outras origens).
    const category = await prisma.category.create({
      data: {
        name: `Electronics ${NS}`,
        slug: `electronics-${NS}`,
      },
    });
    categoryId = category.id;

    // Create test user, then promote it to ADMIN directly via Prisma —
    // não existe (nem deve existir) um endpoint de auto-promoção na API,
    // então o teste precisa elevar o papel por fora, como um seed faria.
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `admin-${NS}@example.com`,
        password: 'Test123!@#',
        name: 'Test Admin',
      });

    authToken = registerResponse.body.accessToken;

    await prisma.user.update({
      where: { id: registerResponse.body.user.id },
      data: { role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  describe('/api/v1/products (GET)', () => {
    it('should return no products for a freshly created category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/products?categoryId=${categoryId}`)
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });

    it('should return products with pagination', async () => {
      await prisma.product.createMany({
        data: [
          {
            name: 'Product 1',
            slug: `product-1-${NS}`,
            description: 'Description 1',
            price: 100,
            categoryId,
            stock: 10,
          },
          {
            name: 'Product 2',
            slug: `product-2-${NS}`,
            description: 'Description 2',
            price: 200,
            categoryId,
            stock: 20,
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products?categoryId=${categoryId}&page=1&limit=10`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });
  });

  describe('/api/v1/products/:id (GET)', () => {
    it('should return a product by id', async () => {
      const product = await prisma.product.findFirst({ where: { categoryId } });

      if (!product) throw new Error('Product not found');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}`)
        .expect(200);

      expect(response.body.id).toBe(product.id);
      expect(response.body.name).toBe(product.name);
    });

    it('should return 404 for non-existent product', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products/non-existent-id')
        .expect(404);
    });
  });

  describe('/api/v1/products (POST)', () => {
    it('should create a new product', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Product',
          slug: `new-product-${NS}`,
          description: 'New Description',
          price: 300,
          categoryId,
          stock: 30,
        })
        .expect(201);

      expect(response.body.name).toBe('New Product');
      // Prisma serializa Decimal como string em JSON (mesma convenção que
      // o frontend já assume em toda a base, ex.: Number(product.price)).
      expect(Number(response.body.price)).toBe(300);
    });

    it('should fail without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/products')
        .send({
          name: 'Unauthorized Product',
        })
        .expect(401);
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Product',
          // Missing required fields
        })
        .expect(400);
    });
  });

  describe('/api/v1/products/:id (PATCH)', () => {
    it('should update a product', async () => {
      const product = await prisma.product.findFirst({ where: { categoryId } });

      if (!product) throw new Error('Product not found');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Product',
          price: 999,
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Product');
      expect(Number(response.body.price)).toBe(999);
    });
  });

  describe('/api/v1/products/:id (DELETE)', () => {
    it('should delete a product', async () => {
      const product = await prisma.product.findFirst({ where: { categoryId } });

      if (!product) throw new Error('Product not found');

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const deletedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });

      expect(deletedProduct).toBeNull();
    });
  });
});
