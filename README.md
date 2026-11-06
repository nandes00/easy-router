
# 🚀 RouterEasy 
Aplicação FullStack para cálculo, visualização e persistência de rotas utilizando:

- NestJS (GraphQL + TypeORM)
- PostgreSQL + PostGIS
- Vue 3 + TypeScript + Apollo
- Google Routes API + Google Maps

---

# 📦 1. Requisitos

Antes de iniciar, você precisa ter instalado:

- Node.js 18+
- Docker + Docker Compose
- PostgreSQL (caso não use Docker)
- Conta Google Cloud com API Key (Routes API + Maps)
- npm ou yarn

---

# 🐳 2. Subir banco de dados (PostGIS)

Execute na raiz do projeto:


docker compose up -d

Isso irá subir:

PostgreSQL
PostGIS habilitado 

🔧 Ativar extensão PostGIS

Depois que o container estiver rodando:
docker exec -it routermini-db psql -U postgres -d routermini

CREATE EXTENSION IF NOT EXISTS postgis;


Crie um arquivo .env dentro do backend:

PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=routermini

GOOGLE_API_KEY=SUA_CHAVE_GOOGLE

cd backend
npm install
Rodar em desenvolvimento:
npm run start:dev
Backend ficará disponível em:
http://localhost:3000/graphql
💻 5. Instalação do Frontend
cd frontend
npm install
Rodar frontend:
npm run dev
Frontend ficará disponível em:
http://localhost:5173
🧠 6. Funcionalidades da aplicação
📍 Rotas
Informar origem e destino
Calcular rota via Google API
Visualizar rota no mapa
Exibir distância (km)
Exibir duração (min)
💾 Persistência
Salvar rotas no banco PostgreSQL
Armazenamento geográfico com PostGIS (LINESTRING)
Listar rotas salvas
Visualizar rota salva
🧪 7. Testes
Rodar testes unitários:
npm run test
Cobertura:
npm run test:cov
🧱 8. Build de produção
Backend
npm run build
npm run start:prod
Frontend
npm run build
npm run preview
🐳 9. Docker (opcional)

Para rodar apenas o banco:

docker compose up -d
🌍 10. Tecnologias utilizadas
Backend
NestJS
GraphQL (Apollo)
TypeORM
PostgreSQL
PostGIS
Axios
Google Routes API
Frontend
Vue 3
TypeScript
Apollo Client
Google Maps API
Vite
📌 11. Arquitetura
Backend
Controller via GraphQL Resolver
Service layer desacoplada
Integração com Google API
Persistência geográfica (PostGIS)
Frontend
Componentização Vue 3
Apollo Client para GraphQL
Google Maps para renderização de rotas
Separação de páginas e componentes
🔐 12. Observações
A API Key do Google é obrigatória
O PostGIS deve estar habilitado no banco
O backend deve estar rodando antes do frontend
