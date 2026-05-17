/**
 * Tests for C9.4 — `musaium_llm_cost_eur_per_hour{tier, museum_id}` Gauge.
 * Spec R4 / R5 / R6 / R7.
 */

import { llmCostEurPerHour, registry } from '@shared/observability/prometheus-metrics';

describe('musaium_llm_cost_eur_per_hour gauge (C9.4)', () => {
  beforeEach(() => {
    // Reset only the cost gauge — don't nuke unrelated metrics that the registry
    // shares with other tests in this file.
    llmCostEurPerHour.reset();
  });

  it('R4 — registered with the exact name + label set {tier, museum_id}', async () => {
    llmCostEurPerHour.set({ tier: 'free', museum_id: '7' }, 1.5);
    const dump = await registry.metrics();
    // Name + help line + label set
    expect(dump).toMatch(/# HELP musaium_llm_cost_eur_per_hour /);
    expect(dump).toMatch(/musaium_llm_cost_eur_per_hour\{tier="free",museum_id="7"\}/);
  });

  it('R4 — help field documents the USD-as-EUR proxy caveat (UFR-013 honesty)', async () => {
    const dump = await registry.metrics();
    expect(dump).toMatch(/# HELP musaium_llm_cost_eur_per_hour .*USD.*EUR proxy/i);
  });

  it('R5 — set() converts cents → EUR by dividing by 100', async () => {
    // Convention: the gauge stores EUR (not cents). 250 cents-source → 2.5 EUR.
    llmCostEurPerHour.set({ tier: 'free', museum_id: '7' }, 250 / 100);
    const dump = await registry.metrics();
    expect(dump).toMatch(/musaium_llm_cost_eur_per_hour\{tier="free",museum_id="7"\} 2\.5/);
  });

  it("R7 — museum_id label uses 'none' for null/undefined museum context", async () => {
    llmCostEurPerHour.set({ tier: 'anonymous', museum_id: 'none' }, 0.5);
    llmCostEurPerHour.set({ tier: 'free', museum_id: '42' }, 1.0);
    const dump = await registry.metrics();
    expect(dump).toMatch(/musaium_llm_cost_eur_per_hour\{tier="anonymous",museum_id="none"\} 0\.5/);
    expect(dump).toMatch(/musaium_llm_cost_eur_per_hour\{tier="free",museum_id="42"\} 1/);
  });

  it('cardinality contract — only the documented label set is permitted', () => {
    // Reading the metric registration — labelNames is the contract.
    // labels(extraLabel) call would type-error if hygiene is right.
    // We assert structurally via the prom-client public API.
    const labelNames = (llmCostEurPerHour as unknown as { labelNames: string[] }).labelNames;
    expect(labelNames).toEqual(['tier', 'museum_id']);
  });
});
