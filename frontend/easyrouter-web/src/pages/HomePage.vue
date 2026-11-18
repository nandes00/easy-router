<template>
  <main class="page">
    <header class="hero">
      <h1>Cálculo, visualização e persistência de rotas</h1>
      <p class="subtitle">
        Informe os endereços de coleta e entrega e escolha o motor de roteirização.
      </p>
    </header>

    <section class="dashboard">
      <aside class="card sidebar">
        <form class="route-form" @submit.prevent="calculateRoute">
          <label>
            Ponto de coleta
            <input
              v-model="originAddress"
              type="text"
              placeholder="Ex: Florianópolis SC"
            />
          </label>

          <label>
            Ponto de entrega
            <input
              v-model="destinationAddress"
              type="text"
              placeholder="Ex: Aeroporto Internacional de Florianópolis SC"
            />
          </label>

          <fieldset class="provider-picker">
            <legend>Motor de rota</legend>
            <div class="provider-options">
              <button
                v-for="option in providerOptions"
                :key="option.value"
                type="button"
                class="provider-option"
                :class="{ active: provider === option.value }"
                :aria-pressed="provider === option.value"
                :disabled="loading"
                @click="provider = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </fieldset>

          <button type="submit" :disabled="loading || !canCalculate">
            {{ loading ? 'Calculando...' : 'Calcular rota' }}
          </button>

          <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        </form>

        <RouterLink class="secondary-button" to="/routes">
            Ver rotas salvas
        </RouterLink>

        <section v-if="calculatedRoute" class="route-summary">
          <div class="summary-item">
            <span>Calculada via</span>
            <strong>{{ providerLabel(calculatedRoute.provider) }}</strong>
          </div>

          <div class="summary-item">
            <span>Distância</span>
            <strong>{{ calculatedRoute.distanceKm }} km</strong>
          </div>

          <div class="summary-item">
            <span>Tempo estimado</span>
            <strong>{{ calculatedRoute.durationText }}</strong>
          </div>

          <div class="summary-item">
            <span>Pontos da rota</span>
            <strong>{{ calculatedRoute.points.length }}</strong>
          </div>

          <button type="button" class="secondary-button" :disabled="saving" @click="saveRoute">
            {{ saving ? 'Salvando...' : 'Salvar rota' }}
          </button>

         <p v-if="successMessage" class="success">{{ successMessage }}</p>
        </section>
      </aside>

      <section class="card map-panel">
        <RouteMap :points="calculatedRoute?.points ?? []" />
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import RouteMap from '../components/route/RouteMap.vue';
import type { CalculatedRoute, RoutingProvider } from '../types/route';
import {
  calculateRoute as calculateRouteService,
  getDefaultRoutingProvider,
  saveRoute as saveRouteService,
} from '../services/route.service';

const router = useRouter();

const originAddress = ref('');
const destinationAddress = ref('');
const calculatedRoute = ref<CalculatedRoute | null>(null);
const errorMessage = ref('');
const successMessage = ref('');
const loading = ref(false);
const saving = ref(false);
const provider = ref<RoutingProvider>('GOOGLE');

const providerOptions: { value: RoutingProvider; label: string }[] = [
  { value: 'GOOGLE', label: 'Google Maps' },
  { value: 'VALHALLA', label: 'Valhalla' },
];

function providerLabel(value?: RoutingProvider) {
  return providerOptions.find((option) => option.value === value)?.label ?? 'Google Maps';
}

onMounted(async () => {
  provider.value = await getDefaultRoutingProvider();
});

const canCalculate = computed(
  () => originAddress.value.trim() && destinationAddress.value.trim(),
);

async function calculateRoute() {
  errorMessage.value = '';
  successMessage.value = '';
  calculatedRoute.value = null;

  if (!canCalculate.value) {
    errorMessage.value = 'Informe o endereço de coleta e entrega.';
    return;
  }

  try {
    loading.value = true;

    calculatedRoute.value = await calculateRouteService({
      originAddress: originAddress.value,
      destinationAddress: destinationAddress.value,
      provider: provider.value,
    });
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    errorMessage.value = `Não foi possível calcular a rota via ${providerLabel(provider.value)}.${detail}`;
  } finally {
    loading.value = false;
  }
}

async function saveRoute() {
  if (!calculatedRoute.value) return;

  try {
    saving.value = true;
    errorMessage.value = '';
    successMessage.value = '';

    await saveRouteService(calculatedRoute.value);

    successMessage.value = 'Rota salva com sucesso.';
    router.push('/routes');
  } catch {
    errorMessage.value = 'Não foi possível salvar a rota.';
  } finally {
    saving.value = false;
  }
}
</script>