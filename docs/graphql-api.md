# GraphQL API

## Endpoint

```text
http://localhost:3000/graphql
```

---

## Autenticação

Operações protegidas exigem header:

```json
{
  "Authorization": "Bearer TOKEN"
}
```

---

## Mutation: registerUser

Cria um usuário.

```graphql
mutation {
  registerUser(input: {
    name: "Vitor"
    email: "vitor@email.com"
    password: "123456"
  }) {
    id
    name
    email
    createdAt
  }
}
```

---

## Mutation: login

Autentica usuário.

```graphql
mutation {
  login(input: {
    email: "admin@easyrouter.com"
    password: "admin123"
  }) {
    accessToken
  }
}
```

---

## Mutation: calculateRoute

Calcula uma rota.

O campo `provider` é opcional e escolhe o motor de roteirização:

- `GOOGLE`: Routes API do Google (endereço → rota direto no Google).
- `VALHALLA`: endereços geocodificados pela Geocoding API do Google e rota calculada pelo microserviço `track-router` (Valhalla), em `ROUTER_MS_URL`.

Sem `provider`, vale o `ROUTING_PROVIDER` do `.env` do backend (padrão `GOOGLE`). A query `defaultRoutingProvider` devolve esse padrão.

```graphql
mutation {
  calculateRoute(input: {
    originAddress: "Florianópolis SC"
    destinationAddress: "Aeroporto Internacional de Florianópolis SC"
    provider: VALHALLA
  }) {
    originAddress
    destinationAddress
    distanceKm
    durationText
    encodedPolyline
    provider
    points {
      sequence
      lat
      lng
    }
  }
}
```

---

## Mutation: saveRoute

Salva uma rota calculada.

```graphql
mutation {
  saveRoute(input: {
    originAddress: "Florianópolis SC"
    destinationAddress: "Aeroporto Internacional de Florianópolis SC"
    distanceKm: 10.5
    durationText: "15 minutos"
    points: [
      { sequence: 1, lat: -20.45, lng: -54.61 }
      { sequence: 2, lat: -20.46, lng: -54.62 }
    ]
  }) {
    id
    originAddress
    destinationAddress
    distanceKm
    durationText
    createdAt
  }
}
```

---

## Query: routes

Lista rotas do usuário autenticado.

```graphql
query {
  routes {
    id
    originAddress
    destinationAddress
    distanceKm
    durationText
    createdAt
    points {
      sequence
      lat
      lng
    }
  }
}
```

---

## Query: route

Busca rota por ID.

```graphql
query {
  route(id: "uuid") {
    id
    originAddress
    destinationAddress
    points {
      sequence
      lat
      lng
    }
  }
}
```

---

## Query: health

```graphql
query {
  health
}
```
