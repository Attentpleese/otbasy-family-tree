import { describe, expect, it } from 'vitest';
import baseline from './fixtures/layout-generation-baseline.json';
import {
  childDialogScenario,
  crossedGrandparentsScenario,
  datedChildrenScenario,
  groundTruthScenario,
  largeFamilyScenario,
  packedIslandsScenario,
  siblingScenario,
  stableBranchesScenario,
  strictAnchorsScenario,
  threeSiblingsScenario,
  viewportIslandsScenario,
} from './familyScenarios';
import { buildGenerationLayout } from './generationEngine';

const scenarios = {
  siblings: siblingScenario,
  dates: datedChildrenScenario,
  'three-siblings': threeSiblingsScenario,
  'stable-before': () => stableBranchesScenario(false),
  'stable-after': () => stableBranchesScenario(true),
  'crossed-grandparents': crossedGrandparentsScenario,
  'viewport-islands': viewportIslandsScenario,
  'packed-islands': packedIslandsScenario,
  'strict-anchors': strictAnchorsScenario,
  'large-family': largeFamilyScenario,
  'child-dialog-none': () => childDialogScenario(0),
  'child-dialog-one': () => childDialogScenario(1),
  'child-dialog-multiple': () => childDialogScenario(2),
  ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
    `ground-truth-${index + 1}`,
    () => groundTruthScenario(index + 1),
  ])),
};

describe('generation and Y baseline', () => {
  it.each(Object.entries(scenarios))('preserves every generation and Y in %s', (name, makeGraph) => {
    const graph = makeGraph();
    const layout = buildGenerationLayout(graph.people, graph.relationships);
    const actual = [...graph.people]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => ({
        id,
        generation: layout.generations.get(id),
        y: layout.positions.get(id).y,
      }));
    const expected = baseline.scenarios[name].people.map(({ id, generation, y }) => ({
      id,
      generation,
      y,
    }));

    expect(actual).toEqual(expected);
  });
});
