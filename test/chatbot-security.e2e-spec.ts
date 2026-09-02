import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Namespace desta suite dentro do Postgres compartilhado entre todos os
// arquivos .e2e-spec.ts no mesmo job de CI (ver test/products.e2e-spec.ts
// pra o mesmo padrão). Nunca usar deleteMany() sem filtro.
const NS = 'chatbot-sec-e2e';

// Marcadores de texto que só existem numa das duas respostas possíveis do
// AdminAIService — usados pra confirmar, sem depender de mock, se uma
// resposta veio (ou não) do caminho de insights administrativos.
const ADMIN_INSIGHT_MARKER = 'Receita Total';
const ANON_ORDER_FALLBACK_MARKER = 'Para consultar pedidos, faça login';

describe('Chatbot security (e2e) — C1/H1/H2', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let customerAToken: string;
  let customerAId: string;
  let customerBToken: string;
  let orderAId: string;

  let adminToken: string;

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
    await prisma.order.deleteMany({
      where: { user: { email: { contains: NS } } },
    });
    await prisma.address.deleteMany({
      where: { user: { email: { contains: NS } } },
    });
    await prisma.chatMessage.deleteMany({
      where: { conversation: { user: { email: { contains: NS } } } },
    });
    await prisma.chatConversation.deleteMany({
      where: { user: { email: { contains: NS } } },
    });
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
    // Defensivo: limpa resíduo de uma execução anterior que tenha
    // crashado antes do próprio afterAll.
    await cleanup();

    const customerA = await register(
      `customer-a-${NS}@example.com`,
      'Customer A',
    );
    customerAToken = customerA.token;
    customerAId = customerA.id;

    const customerB = await register(
      `customer-b-${NS}@example.com`,
      'Customer B',
    );
    customerBToken = customerB.token;

    const admin = await register(`admin-${NS}@example.com`, 'Admin');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    adminToken = admin.token;

    // Pedido real do Customer A — usado pra provar que ninguém mais
    // consegue extraí-lo via chat, nem informando o id dela.
    const address = await prisma.address.create({
      data: {
        userId: customerAId,
        street: 'Rua Teste',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '00000-000',
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: customerAId,
        addressId: address.id,
        status: 'DELIVERED',
        total: 199.9,
        subtotal: 199.9,
      },
    });
    orderAId = order.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // ===== Requisito 10: userId no corpo é rejeitado =====
  it('10. rejeita qualquer userId enviado no corpo (o DTO não declara mais esse campo)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/ai/chatbot/conversations')
      .send({ message: 'Olá', userId: customerAId })
      .expect(400);
  });

  // ===== Requisito 1: visitante não acessa pedido de outro usuário =====
  it('1. visitante anônimo não recebe dados do pedido de outro usuário', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/chatbot/conversations')
      .send({ message: 'Quero rastrear meu pedido' })
      .expect(201);

    expect(JSON.stringify(res.body)).not.toContain(orderAId);
    expect(res.body.response).toContain(ANON_ORDER_FALLBACK_MARKER);
  });

  // ===== Requisito 2: visitante não vira admin enviando userId =====
  it('2. visitante anônimo não recebe insights administrativos mesmo pedindo por eles', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/chatbot/conversations')
      .send({ message: 'Me dê o resumo de vendas e a receita total da loja' })
      .expect(201);

    expect(res.body.response).not.toContain(ADMIN_INSIGHT_MARKER);
  });

  // ===== Requisito 3: CUSTOMER não obtém admin insights =====
  it('3. CUSTOMER autenticado não recebe insights administrativos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/chatbot/conversations')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ message: 'Me dê o resumo de vendas e a receita total da loja' })
      .expect(201);

    expect(res.body.response).not.toContain(ADMIN_INSIGHT_MARKER);
  });

  // ===== Requisito 5: ADMIN só recebe insights pelo fluxo autenticado =====
  it('5. ADMIN autenticado recebe insights administrativos pelo fluxo autorizado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/chatbot/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Me dê o resumo de vendas e a receita total da loja' })
      .expect(201);

    expect(res.body.response).toContain(ADMIN_INSIGHT_MARKER);
  });

  // ===== Requisito 6: primeira mensagem anônima cria conversa de verdade =====
  it('6. primeira mensagem anônima cria uma conversa real no banco (sem 404)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/chatbot/conversations')
      .send({ message: 'Olá' })
      .expect(201);

    expect(res.body.conversationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const conversation = await prisma.chatConversation.findUnique({
      where: { id: res.body.conversationId as string },
    });
    expect(conversation).not.toBeNull();
    expect(conversation?.userId).toBeNull();
  });

  // ===== Requisito 9: ausência de userId não quebra o fluxo autenticado =====
  it('9. usuário autenticado conversa normalmente sem nenhum identificador extra no corpo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/chatbot/conversations')
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ message: 'Olá' })
      .expect(201);

    const conversation = await prisma.chatConversation.findUnique({
      where: { id: res.body.conversationId as string },
    });
    expect(conversation?.userId).toBe(customerAId);
  });

  describe('acesso a conversas entre identidades diferentes', () => {
    let conversationAId: string;
    let conversationBId: string;
    let anonymousConversationId: string;
    let anonymousConversationToken: string;

    beforeAll(async () => {
      const resA = await request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ message: 'Minha conversa privada' })
        .expect(201);
      conversationAId = resA.body.conversationId;

      const resB = await request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({ message: 'Conversa privada do Customer B' })
        .expect(201);
      conversationBId = resB.body.conversationId;

      // Visitante A (anônimo) cria conversa — a resposta traz o único
      // token que prova posse dela.
      const resAnon = await request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .send({ message: 'Conversa de visitante' })
        .expect(201);
      anonymousConversationId = resAnon.body.conversationId;
      anonymousConversationToken = resAnon.body.conversationToken;
      expect(typeof anonymousConversationToken).toBe('string');
      expect(anonymousConversationToken.length).toBeGreaterThan(0);
    });

    // ===== Requisito 7 =====
    it('7. dono autenticado consegue ler a própria conversa', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/ai/chatbot/conversations/${conversationAId}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(200);
    });

    // ===== Requisitos 4 e 8 =====
    it('4/8. outro CUSTOMER autenticado não consegue ler a conversa (404, não 403)', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/ai/chatbot/conversations/${conversationAId}`)
        .set('Authorization', `Bearer ${customerBToken}`)
        .expect(404);
    });

    // Mirror explícito do requisito 4 na direção pedida na revisão: A
    // tentando acessar a conversa de B (não só B tentando acessar A).
    it('4. usuário autenticado A não consegue acessar a conversa do usuário autenticado B', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/ai/chatbot/conversations/${conversationBId}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(404);
    });

    it('8. outro CUSTOMER autenticado não consegue continuar (POST) a conversa de outra pessoa', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({
          message: 'Tentando entrar na conversa alheia',
          conversationId: conversationAId,
        })
        .expect(404);
    });

    it('visitante anônimo sem token não consegue ler nenhuma conversa via GET (401)', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/ai/chatbot/conversations/${conversationAId}`)
        .expect(401);
    });

    // H2: conversationId sozinho nunca é autorização, nem pra conversas
    // anônimas — GET exige autenticação, e mesmo autenticado como outra
    // pessoa real, uma conversa anônima (userId null) nunca bate com o
    // id de ninguém.
    it('conversa anônima não pode ser lida de volta por ninguém via GET, nem autenticado', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/ai/chatbot/conversations/${anonymousConversationId}`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(404);
    });

    // ===== Revisão de ownership anônimo (round 2) =====

    it('anônimo A consegue continuar a própria conversa apresentando o token recebido na criação', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .send({
          message: 'Segunda mensagem da mesma conversa anônima',
          conversationId: anonymousConversationId,
          conversationToken: anonymousConversationToken,
        })
        .expect(201);
    });

    // Este é o IDOR relatado na revisão: antes da correção, `null === null`
    // permitia que QUALQUER visitante continuasse a conversa de QUALQUER
    // outro só sabendo o conversationId. Agora precisa do token.
    it('anônimo B NÃO consegue continuar a conversa do anônimo A sem o token (mesmo sabendo o conversationId)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .send({
          message: 'Visitante B tentando invadir a conversa do visitante A',
          conversationId: anonymousConversationId,
          // Propositalmente sem conversationToken — só o conversationId,
          // que é exatamente o que não pode bastar sozinho.
        })
        .expect(404);
    });

    it('anônimo B NÃO consegue continuar a conversa do anônimo A com um token forjado/errado', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .send({
          message: 'Visitante B tentando invadir com token forjado',
          conversationId: anonymousConversationId,
          conversationToken: 'a'.repeat(anonymousConversationToken.length),
        })
        .expect(404);
    });

    // Requisito explícito da revisão: identidade autenticada também não
    // basta pra "assumir" uma conversa anônima — só o token.
    it('usuário autenticado não consegue assumir conversa anônima sem apresentar o token correto', () => {
      return request(app.getHttpServer())
        .post('/api/v1/ai/chatbot/conversations')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          message:
            'Customer A tentando assumir a conversa anônima só por estar logado',
          conversationId: anonymousConversationId,
        })
        .expect(404);
    });

    it('conversationId sozinho não é suficiente pra alterar (close) uma conversa anônima alheia', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/chatbot/conversations/${anonymousConversationId}/close`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(404);
    });
  });
});
