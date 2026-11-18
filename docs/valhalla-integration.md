# Integração com o Valhalla (track-router)

O Easy Router calcula rotas com dois motores, escolhidos na tela ("Motor de rota") ou pelo campo `provider` da mutation `calculateRoute`:

| Provider   | Endereço → coordenada      | Cálculo da rota                           |
|------------|----------------------------|-------------------------------------------|
| `GOOGLE`   | Routes API do Google       | Routes API do Google                      |
| `VALHALLA` | Geocoding API do Google    | microserviço `track-router` → Valhalla    |

```
Front (Vue) ──GraphQL──> Backend (NestJS)
                           ├─ GOOGLE   → GoogleMapsGateWay → Routes API
                           └─ VALHALLA → GoogleGeocodingGateway → Geocoding API
                                         ValhallaGateway → POST {ROUTER_MS_URL}/simple_route
                                                             └─ track-router → Valhalla (:8002)
```

## 1. Subir o microserviço + Valhalla

No projeto `router-microsservice`:

```bash
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml logs -f valhalla
```

Na primeira subida o Valhalla baixa o mapa da região Sul (OpenStreetMap/Geofabrik) e gera os tiles. Isso pode levar bastante tempo, dependendo da máquina e da internet. Espere até o log mostrar que o serviço está escutando na porta 8002. Os tiles ficam em `docker/valhalla/custom_files`, então as próximas subidas são rápidas.

Teste direto no microserviço (centro de Florianópolis → aeroporto):

```bash
curl -X POST http://localhost:3001/simple_route \
  -H 'Content-Type: application/json' \
  -d '{"origin":[-27.5954,-48.5480],"destination":[-27.6703,-48.5525]}'
```

Resposta esperada: `distanceMeters`, `durationSeconds` e `encodedPolyline` (precisão 5, igual ao Google).

## 2. Configurar o backend do Easy Router

Variáveis novas no `.env` do backend (`backend/easyrouter-api/.env`):

```env
# Provider padrão quando o front não escolhe: GOOGLE | VALHALLA
ROUTING_PROVIDER=GOOGLE
# Onde está o microserviço track-router
ROUTER_MS_URL=http://localhost:3001
```

- Backend rodando com `npm run start:dev` na sua máquina: use `http://localhost:3001`.
- Backend rodando pelo `docker-compose.yml` do Easy Router: o compose já usa `http://host.docker.internal:3001` por padrão.

No Google Cloud, a mesma `GOOGLE_MAPS_API_KEY` precisa ter a **Geocoding API** habilitada, além da Routes API e da Maps JavaScript API.

## 3. Testar

1. Abra o front e faça login.
2. Escolha **Valhalla** em "Motor de rota".
3. Calcule, por exemplo, "Praça XV de Novembro, Florianópolis SC" → "Aeroporto Internacional de Florianópolis SC".
4. O resumo mostra "Calculada via Valhalla". Troque para Google Maps e compare distância e tempo.

## Problemas comuns

| Mensagem                                         | Causa provável                                                        |
|--------------------------------------------------|-----------------------------------------------------------------------|
| `Microserviço de rotas indisponível em ...`      | `track-router` não está de pé, ou `ROUTER_MS_URL` está errado          |
| `Nenhuma rota encontrada pelo Valhalla ...`      | Endereço fora da região carregada (só o Sul), ou tiles ainda gerando  |
| `Erro ao geocodificar endereço: REQUEST_DENIED`  | Geocoding API não habilitada na chave do Google                       |
| `Endereço não encontrado`                        | O Google não achou o endereço; inclua cidade e UF                     |

## Observações

- A duração no Valhalla passa por um piso de velocidade (`VALHALLA_MIN_SPEED_KMH=30`) configurado no microserviço, então os tempos podem diferir dos do Google.
- O `provider` não é salvo junto com a rota (a tabela `routes` não tem essa coluna).
