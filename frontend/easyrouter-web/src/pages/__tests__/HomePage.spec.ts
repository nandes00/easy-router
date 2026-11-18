import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import HomePage from '../HomePage.vue';
import type { CalculatedRoute } from '../../types/route';

/**
 * Testes do seletor de motor de rota (Google / Valhalla) na tela inicial.
 * O backend (GraphQL), o mapa do Google e o roteador são substituídos por mocks.
 */

const routeService = vi.hoisted(() => ({
  calculateRoute: vi.fn(),
  saveRoute: vi.fn(),
  getDefaultRoutingProvider: vi.fn(),
}));

vi.mock('../../services/route.service', () => routeService);
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../components/route/RouteMap.vue', () => ({
  default: { name: 'RouteMap', props: ['points'], template: '<div class="route-map-stub" />' },
}));

const fakeRoute = (provider: 'GOOGLE' | 'VALHALLA'): CalculatedRoute => ({
  originAddress: 'Praça XV de Novembro, Florianópolis SC',
  destinationAddress: 'Aeroporto Internacional de Florianópolis SC',
  distanceKm: provider === 'VALHALLA' ? 14.9 : 15.23,
  durationText: '20 min',
  encodedPolyline: 'abc',
  provider,
  points: [
    { sequence: 1, lat: -27.59, lng: -48.54 },
    { sequence: 2, lat: -27.67, lng: -48.55 },
  ],
});

async function mountPage() {
  const wrapper = mount(HomePage, { global: { stubs: { RouterLink: true } } });
  await flushPromises(); // espera o onMounted buscar o provider padrão
  return wrapper;
}

function providerButton(wrapper: Awaited<ReturnType<typeof mountPage>>, label: string) {
  const button = wrapper.findAll('.provider-option').find((b) => b.text() === label);
  if (!button) throw new Error(`botão "${label}" não encontrado`);
  return button;
}

async function fillAndSubmit(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  const [origin, destination] = wrapper.findAll('input');
  await origin!.setValue('Praça XV de Novembro, Florianópolis SC');
  await destination!.setValue('Aeroporto Internacional de Florianópolis SC');
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('HomePage - seletor de motor de rota', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    routeService.getDefaultRoutingProvider.mockResolvedValue('GOOGLE');
  });

  it('mostra as duas opções de motor', async () => {
    const wrapper = await mountPage();

    const labels = wrapper.findAll('.provider-option').map((b) => b.text());
    expect(labels).toEqual(['Google Maps', 'Valhalla']);
  });

  it('já vem marcado com o motor padrão configurado no backend', async () => {
    routeService.getDefaultRoutingProvider.mockResolvedValue('VALHALLA');

    const wrapper = await mountPage();

    expect(providerButton(wrapper, 'Valhalla').classes()).toContain('active');
    expect(providerButton(wrapper, 'Google Maps').classes()).not.toContain('active');
  });

  it('troca a seleção ao clicar', async () => {
    const wrapper = await mountPage();

    await providerButton(wrapper, 'Valhalla').trigger('click');

    expect(providerButton(wrapper, 'Valhalla').attributes('aria-pressed')).toBe('true');
    expect(providerButton(wrapper, 'Google Maps').attributes('aria-pressed')).toBe('false');
  });

  it('envia o motor escolhido junto com os endereços', async () => {
    routeService.calculateRoute.mockResolvedValue(fakeRoute('VALHALLA'));
    const wrapper = await mountPage();

    await providerButton(wrapper, 'Valhalla').trigger('click');
    await fillAndSubmit(wrapper);

    expect(routeService.calculateRoute).toHaveBeenCalledWith({
      originAddress: 'Praça XV de Novembro, Florianópolis SC',
      destinationAddress: 'Aeroporto Internacional de Florianópolis SC',
      provider: 'VALHALLA',
    });
  });

  it('mostra no resumo qual motor calculou a rota', async () => {
    routeService.calculateRoute.mockResolvedValue(fakeRoute('VALHALLA'));
    const wrapper = await mountPage();

    await providerButton(wrapper, 'Valhalla').trigger('click');
    await fillAndSubmit(wrapper);

    const summary = wrapper.find('.route-summary').text();
    expect(summary).toContain('Calculada via');
    expect(summary).toContain('Valhalla');
    expect(summary).toContain('14.9 km');
  });

  it('mostra a mensagem de erro com o nome do motor', async () => {
    routeService.calculateRoute.mockRejectedValue(new Error('Microserviço de rotas indisponível'));
    const wrapper = await mountPage();

    await providerButton(wrapper, 'Valhalla').trigger('click');
    await fillAndSubmit(wrapper);

    expect(wrapper.find('.error').text()).toContain('via Valhalla');
    expect(wrapper.find('.error').text()).toContain('Microserviço de rotas indisponível');
  });

  it('não deixa calcular sem os dois endereços', async () => {
    const wrapper = await mountPage();

    const submit = wrapper.find('button[type="submit"]');
    expect(submit.attributes('disabled')).toBeDefined();
  });
});
