# Testes — Easy Router + integração com Valhalla

Os testes estão organizados em três camadas, da base para o topo da pirâmide:

```
            ┌──────────────────────────┐
            │  3. Complementares       │  smoke, comparação, carga, CI, front
            ├──────────────────────────┤
            │  2. Integração           │  HTTP de verdade, pontas externas mockadas
            ├──────────────────────────┤
            │  1. Unitários            │  uma classe/função por vez, tudo mockado
            └──────────────────────────┘
```

Quanto mais embaixo, mais rápido, mais barato e mais testes. Quanto mais em cima, mais próximo do uso real, mas mais lento e dependente de infraestrutura.

## Resumo rápido

| Camada | O quê | Onde | Comando | Testes |
|---|---|---|---|---|
| 1 | Unitários do backend | `backend/easyrouter-api/src/**/*.spec.ts` | `npm test` | 48 |
| 1 | Cobertura do módulo de rotas | idem | `npm run test:cov:routes` | — |
| 2 | Mutation `calculateRoute` + guard JWT | `backend/easyrouter-api/test/routes.e2e-spec.ts` | `npm run test:integration` | 10 |
| 2 | Endpoint `/simple_route` | microserviço `src/routes/__tests__/` | `yarn test:simple-route` | 11 |
| 3 | Front: seletor Google/Valhalla | `frontend/easyrouter-web/src/pages/__tests__/` | `npm test` | 7 |
| 3 | Smoke test (Valhalla real) | microserviço `scripts/smoke-simple-route.js` | `yarn smoke` | 4 checagens |
| 3 | Comparação Google × Valhalla | `scripts/compare-providers.mjs` | `node scripts/compare-providers.mjs` | 6 rotas |
| 3 | Carga (k6) | microserviço `load/simple-route.k6.js` | ver seção 3.4 | — |
| 3 | CI (GitHub Actions) | `.github/workflows/tests.yml` | automático a cada push | — |

---

```bash
cd ~/personal_projects/easy-router
docker compose run --rm --no-deps backend npm run test:integration
docker compose run --rm --no-deps backend npm test
```

## 1. Testes unitários (Jest)

**O que é:** testa uma peça isolada (uma classe ou função). Tudo o que ela usa de fora é trocado por um **mock**, um objeto falso controlado pelo teste.

**Por que mockar o Google e o Valhalla:**
- **Rápido:** os 48 testes rodam em cerca de 2 segundos.
- **Determinístico:** o resultado não muda se o Google estiver lento ou fora do ar.
- **Barato:** nenhuma chamada paga à API do Google.
- **Testa erro de propósito:** dá para simular "endereço não existe", "microserviço caiu" e "chave inválida", coisas difíceis de provocar com o serviço real.

**Como rodar** (em `backend/easyrouter-api`):
```bash
npm test                 # todos os unitários
npm run test:cov:routes  # cobertura só do módulo de rotas (o que criamos)
npx jest --verbose       # mostra o nome de cada teste
```

### O que cada arquivo testa

**`routes.service.spec.ts`: a regra de negócio da troca de motor**
- `provider: VALHALLA` → chama o gateway do Valhalla e não chama o do Google.
- `provider: GOOGLE` → chama o Google, mesmo com o `.env` dizendo VALHALLA (a escolha da tela vence).
- Sem provider → segue o `ROUTING_PROVIDER` do `.env`.
- Sem provider e sem `.env` → usa Google (padrão seguro).
- Usa `Test.createTestingModule` do Nest: o service é montado pela **injeção de dependências**, trocando as dependências por mocks com `{ provide: X, useValue: mock }`.

**`gateways/valhalla.gateway.spec.ts`: o fluxo endereço → coordenada → rota**
- Geocodifica origem e destino.
- Chama o `/simple_route` com `[lat, lng]` (`jest.mock('axios')` intercepta o HTTP).
- Converte a resposta: 14905 m → `14.9` km, 1204 s → `"20 min"`.
- Decodifica a polyline em pontos numerados na ordem.
- Erros: 404 vira `NotFoundException`; sem resposta vira "microserviço indisponível"; 502 repassa o detalhe; se a geocodificação falha, o microserviço nem é chamado.

**`gateways/google-geocoding.gateway.spec.ts`**
- Devolve lat/lng e endereço formatado.
- Envia `language: pt-BR` e `region: br`.
- `ZERO_RESULTS` → "Endereço não encontrado" (`BadRequestException`).
- `REQUEST_DENIED` → erro de configuração (Geocoding API não habilitada).
- Sem chave → nem chama o Google.

**`gateways/google-maps.gateway.spec.ts`**
- Converte a resposta da Routes API e marca `provider: GOOGLE`.
- Formata a duração quando o Google não manda o texto pronto.
- Sem rota, sem chave e chave inválida.

**`enums/routing-provider.enum.spec.ts` e `utils/format-duration.spec.ts`**
- Funções puras, com `it.each` (tabela de casos): `"valhalla"`, `" Valhalla "`, valor vazio, valor inválido; 29 s → `"0 min"`, 3900 s → `"1 h 5 min"`.

### Cobertura

```
routes.service.ts           | 100 % linhas
google-geocoding.gateway.ts | 100 %
google-maps.gateway.ts      | 100 %
valhalla.gateway.ts         | 100 %
routing-provider.enum.ts    | 100 %
format-duration.ts          | 100 %
```

Se perguntarem por que o `npm run test:cov` geral mostra um número mais baixo: ele também conta auth, users e migrations, que não eram o foco desta entrega. **Cobertura de 100% não significa ausência de bug**, só que toda linha foi executada por algum teste. O que vale é testar os comportamentos importantes, inclusive os de erro.

---

## 2. Testes de integração

**O que é:** testa várias peças **juntas**, pelo caminho real (requisição HTTP → framework → código). Só as pontas externas (Google, Valhalla, banco) continuam simuladas.

**Diferença para o unitário:** o unitário chama `service.calculateRoute()` direto. O de integração faz um `POST /graphql` de verdade e passa pelo parser do GraphQL, pela validação do schema, pelo guard de autenticação, pelo resolver e pelo service.

### 2.1 Mutation `calculateRoute` (NestJS + GraphQL + JWT)

`backend/easyrouter-api/test/routes.e2e-spec.ts`. Para rodar: `npm run test:integration`.

Sobe uma aplicação Nest com GraphQL (Apollo), Passport/JWT, `GqlAuthGuard`, `RoutesResolver` e `RoutesService` reais. Usa o **supertest** para fazer as requisições. Gateways e repositório são mocks, então não precisa de Postgres nem de internet.

| Cenário | Esperado |
|---|---|
| Sem token | `Unauthorized`, gateway não é chamado |
| Token inválido | `Unauthorized` |
| Token assinado com outro segredo | `Unauthorized` (o guard confere a assinatura) |
| Token válido + `VALHALLA` | rota do Valhalla no formato do schema |
| Token válido + `GOOGLE` | rota do Google |
| Sem `provider` | usa `ROUTING_PROVIDER` |
| `provider: "OSRM"` | HTTP 400: o enum do GraphQL barra antes de chegar ao código |
| Sem endereços | HTTP 400 |
| Gateway lança "Nenhuma rota encontrada" | a mensagem chega ao front |
| Query `defaultRoutingProvider` | devolve o padrão |

**Pontos para comentar:**
- O token válido é gerado no próprio teste com o `JwtService`, igual ao login real.
- Os testes de guard provam que a rota está protegida: sem login, ninguém gasta a cota do Google.
- O teste com `"OSRM"` mostra uma vantagem do GraphQL: o schema tipado valida a entrada sozinho.

> O `npm run test:e2e` também roda o `app.e2e-spec.ts` que veio do template do Nest. Esse precisa do Postgres no ar. Por isso foi criado o `test:integration`, que roda só o de rotas.

### 2.2 Endpoint `/simple_route` (microserviço)

`router-microsservice/src/routes/__tests__/simpleRoute.integration.test.ts`. Para rodar: `yarn test:simple-route`.

Para dar para testar, o endpoint foi extraído para `src/routes/simpleRoute.ts`, uma função que recebe "quem fornece o provider". Em produção é o `RoutesProviderFactory`; no teste é um mock. Isso é **injeção de dependência**, a mesma ideia do Nest, só que feita à mão.

**Bloco 1: provider mockado**
- 200 com distância, duração e polyline.
- `DRIVE` por padrão, `WALK` quando pedido.
- 404 quando não há caminho; 502 quando o provider falha.
- 400 para body inválido (sem destino, coordenada como texto, coordenada incompleta, travelMode inválido). Quem valida é o schema **zod**, e o provider nem é chamado.

**Bloco 2: `ValhallaRoutesProvider` real com um Valhalla simulado**
- O teste sobe um `http.Server` local que imita a API `/route` do Valhalla.
- Confere o formato da requisição enviada (`costing: auto`, `locations` com `lat`/`lon`).
- Confere a **conversão da polyline de precisão 6 (Valhalla) para 5 (Google)**, o detalhe que faria a rota aparecer no lugar errado do mapa se estivesse errado.
- Confere o piso de 30 km/h na duração (10 km em 1 h → limitado a 20 min).
- Erro 442 do Valhalla ("No path could be found") → 404.

> Os testes antigos do microserviço (`yarn test`) têm 2 falhas no `GoogleRoutesProvider.test.ts` que já existiam antes desta integração. Por isso o comando separado `yarn test:simple-route`.

---

## 3. Testes complementares

### 3.1 Smoke test contra o Valhalla real

`router-microsservice/scripts/smoke-simple-route.js`. Para rodar: `yarn smoke` (ou `node scripts/smoke-simple-route.js`).

**O que é:** um teste rápido contra a infraestrutura **de verdade**, sem nada mockado. O nome vem da eletrônica: liga o aparelho e vê se sai fumaça.

**Por que, se já temos os outros:** os testes com mock provam que o código está certo, mas não pegam problema de infraestrutura, como tiles da região errada (exatamente o que aconteceu com o arquivo do Sudeste/Centro-Oeste), container fora do ar ou porta errada.

**O que faz:**
1. `GET /status` no Valhalla.
2. Três rotas conhecidas pelo microserviço, conferindo se a distância está numa faixa plausível (centro → aeroporto entre 12 e 18 km).

Termina com código de saída 0 (passou) ou 1 (falhou), então pode rodar depois de cada deploy.

> As faixas de distância de "Centro → UFSC" e "Centro → São José" são estimativas. Rode uma vez com o ambiente real e ajuste os valores em `CASES` se necessário.

### 3.2 Comparação Google × Valhalla

`easy-router/scripts/compare-providers.mjs`. Para rodar: `node scripts/compare-providers.mjs` (com o microserviço no ar).

Calcula 6 rotas da Grande Florianópolis pelos dois motores, **com as mesmas coordenadas**, e mostra uma tabela com distância, tempo e a diferença percentual. Falha se alguma diferença passar de 20% (ajustável com `MAX_DIFF_PERCENT`).

**Para que serve na apresentação:** responde com dados à pergunta "o Valhalla é confiável o bastante para substituir o Google?". Espere tempos diferentes: o Google usa trânsito, o Valhalla não, e o microserviço aplica piso de 30 km/h.

> Cada execução faz 6 chamadas pagas à Routes API. A chave é lida de `backend/easyrouter-api/.env`.

### 3.3 Testes do front (Vitest + Vue Test Utils)

`frontend/easyrouter-web/src/pages/__tests__/HomePage.spec.ts`. Para rodar: `npm test` (em `frontend/easyrouter-web`).

**Vitest** é o "Jest do Vite": mesma sintaxe (`describe`, `it`, `expect`), integrado ao build do front. O **Vue Test Utils** monta o componente num navegador simulado (jsdom) e permite clicar, digitar e ler a tela.

Testa: as duas opções aparecem; já vem marcado o padrão do backend; o clique troca a seleção; a mutation recebe o `provider` escolhido; o resumo mostra "Calculada via Valhalla"; o erro mostra o motor e o motivo; o botão fica desabilitado sem endereços.

### 3.4 Teste de carga (k6)

`router-microsservice/load/simple-route.k6.js`. Para rodar (sem instalar o k6):
```bash
docker run --rm -i --network host grafana/k6 run - < load/simple-route.k6.js
```

Simula de 5 a 20 usuários simultâneos por 1 minuto, pedindo rotas aleatórias entre 8 pontos da Grande Florianópolis. Passa se:
- menos de 1% das requisições falharem (`http_req_failed`);
- 95% das respostas vierem em menos de 500 ms (`p(95)`).

**O que mostrar:** a tabela final do k6 com requisições por segundo e latência p95. **p95** é "95% das requisições foram mais rápidas que isso", uma métrica melhor que a média porque não esconde as lentas.

### 3.5 Integração contínua (GitHub Actions)

`.github/workflows/tests.yml`. Roda automaticamente a cada push e pull request:
- **backend:** testes unitários com cobertura + teste de integração;
- **frontend:** Vitest.

**Argumento:** os testes só protegem o projeto se rodarem sempre. Com CI, um PR que quebra a troca de motor fica vermelho antes do merge.

Smoke, comparação e carga ficam fora do CI de propósito: dependem do Valhalla no ar e, no caso da comparação, gastam cota do Google.

---

## Roteiro sugerido para a apresentação

1. **Pirâmide** (1 min): o desenho do topo deste arquivo.
2. **Unitários ao vivo:** `npx jest --verbose` e depois `npm run test:cov:routes`. Abra o `routes.service.spec.ts` e mostre um mock com `{ provide, useValue }`.
3. **Integração do Nest:** `npm run test:integration`. Abra o teste do guard ("sem token" → `Unauthorized`).
4. **Integração do microserviço:** `yarn test:simple-route`. Mostre o teste da polyline 6 → 5.
5. **Front:** `npm test` no front.
6. **Infra real:** `yarn smoke` e, se der tempo, a comparação Google × Valhalla.
7. **Próximos passos:** k6 e CI (mostrar os arquivos), testes do módulo de auth, e incluir o microserviço no CI depois de corrigir os 2 testes antigos do Google.

## Perguntas que podem aparecer

- **Mock não deixa o teste "falso"?** O mock testa **o nosso código** dado um comportamento da dependência. Para saber se a dependência real funciona existem o smoke test e a comparação. Cada camada cobre o que a outra não cobre.
- **Por que Jest no back e Vitest no front?** O Nest já vem com Jest. O Vitest usa a mesma configuração do Vite do front e tem API compatível com o Jest, então a sintaxe é a mesma nos dois.
- **Qual a diferença entre `toBe` e `toEqual`?** `toBe` compara identidade (valores primitivos); `toEqual` compara o conteúdo de objetos e arrays; `toMatchObject` confere só os campos informados.
- **Por que `beforeEach` com `resetAllMocks`?** Para cada teste começar do zero. Sem isso, a chamada de um teste "vaza" para o próximo e o `toHaveBeenCalledTimes(1)` erra.
- **O que é `it.each`?** Um teste parametrizado: a mesma verificação rodando para uma tabela de entradas.
