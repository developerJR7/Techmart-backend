# 🚀 TechMart - E-commerce Platform

[![Status](https://img.shields.io/badge/status-production--ready-success)]()
[![Backend](https://img.shields.io/badge/backend-NestJS-red)]()
[![Frontend](https://img.shields.io/badge/frontend-Next.js-black)]()
[![Database](https://img.shields.io/badge/database-PostgreSQL-blue)]()

TechMart é uma plataforma de e-commerce moderna e completa, desenvolvida com as melhores práticas de engenharia de software. O projeto integra um backend robusto em NestJS com um frontend performático em Next.js, oferecendo recursos avançados como IA generativa, pagamentos reais e analytics.

---

## ✨ Funcionalidades Principais

- **🛍️ E-commerce Completo**: Catálogo, busca avançada, carrinho, checkout e gestão de pedidos.
- **🤖 Inteligência Artificial**: Chatbot de suporte (Gemini), recomendações personalizadas e assistente administrativo.
- **💳 Pagamentos**: Integração completa com Stripe (Cartão) e suporte a PIX/Boleto.
- **📊 Dashboard Admin**: Analytics em tempo real, gestão de inventário e insights de IA.
- **🔒 Segurança**: Autenticação JWT, RBAC (Role-Based Access Control), Rate Limiting e proteção contra fraudes.
- **📱 PWA Ready**: Suporte a Progressive Web App para experiência mobile nativa.

---

## 🛠️ Stack Tecnológico

### Backend
- **Framework**: NestJS 10
- **Linguagem**: TypeScript
- **Database**: PostgreSQL 16 + Prisma ORM
- **Cache**: Redis 7
- **AI**: Google Gemini 1.5 Flash
- **Infra**: Docker, Nginx, Prometheus, Grafana

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI**: Tailwind CSS, Shadcn/ui, Framer Motion
- **State**: Zustand, React Query
- **Forms**: React Hook Form + Zod

---

## 🚀 Como Rodar o Projeto

### Pré-requisitos
- Node.js 18+
- Docker & Docker Compose
- Git

### 1. Instalação Rápida (Docker)

A maneira mais fácil de rodar todo o ecossistema (Backend + Frontend + DB + Redis) é usando Docker.

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/techmart.git
cd techmart

# Configure as variáveis de ambiente
cp backend/.env.example backend/.env
# Edite backend/.env com suas chaves (Stripe, Google AI, etc)

# Inicie os serviços
docker-compose -f backend/docker-compose.prod.yml up -d
```

Acesse:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/api/v1/docs

### 2. Desenvolvimento Local

Se preferir rodar localmente para desenvolvimento:

**Backend:**
```bash
cd backend
npm install
docker-compose up -d postgres redis # Apenas serviços de infra
npm run prisma:migrate
npm run prisma:seed # Popula o banco com dados de teste
npm run start:dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## 📚 Documentação da API

A API é totalmente documentada via Swagger. Acesse `http://localhost:3001/api/v1/docs` para ver todos os endpoints, testar requisições e ver esquemas de dados.

### Endpoints Principais

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/products` | Lista produtos com filtros e paginação |
| `POST` | `/auth/login` | Autenticação de usuários |
| `POST` | `/cart` | Adiciona item ao carrinho |
| `POST` | `/orders` | Cria um novo pedido |
| `POST` | `/ai/chat` | Interage com o chatbot de IA |

---

## 🧪 Testes

O projeto possui cobertura de testes unitários e E2E.

```bash
cd backend
npm run test        # Unit tests
npm run test:e2e    # End-to-end tests
npm run test:cov    # Cobertura de testes
```

---

## 🚢 Deploy

O projeto está pronto para deploy em diversas plataformas.

### Railway / Vercel
O projeto inclui arquivos de configuração (`railway.json`, `vercel.json`) para deploy automático. Basta conectar seu repositório.

### VPS (Docker)
Para deploy em servidor próprio (AWS, DigitalOcean):
1. Provisione o servidor com Docker.
2. Clone o repo.
3. Configure `.env`.
4. Execute `docker-compose -f docker-compose.prod.yml up -d`.

---

## 👥 Credenciais de Teste (Seed)

Após rodar `npm run prisma:seed`, use estas contas:

- **Admin**: `admin@techmart.com` / `admin123`
- **Cliente**: `user@techmart.com` / `user123`

---

**Desenvolvido com 💜 por José Roberto Monteiro**
