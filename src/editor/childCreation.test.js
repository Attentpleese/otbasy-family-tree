import { describe, expect, it } from 'vitest';
import {
  addChildToExistingCouple,
  addChildWithNewPartner,
  addPersonWithRelationship,
  createEmptyPerson,
} from '../domain/familyGraph';
import { buildFamilyTreeLayout } from '../tree/familyTreeLayout';
import { TREE_CARD_WIDTH, PARTNER_GAP } from '../tree/familyTreeLayout';
import { buildFamilyUnits } from '../tree/familyUnits';
import { getChildCreationOptions } from './childCreation';

const person = (id) => createEmptyPerson({ id, firstName: id });

describe('add-child acceptance flow', () => {
  it('offers new-partner and single-parent flows when there is no active partner', () => {
    const selected = person('selected');
    const options = getChildCreationOptions([selected], [], selected.id);

    expect(options.map((option) => option.type)).toEqual(['new-partner', 'single']);

    const result = addPersonWithRelationship({
      people: [selected],
      relationships: [],
      selectedId: selected.id,
      relationType: 'child',
      person: person('single-child'),
    });
    expect(result.ok).toBe(true);
    expect(buildFamilyUnits(result.people, result.relationships).familyUnits)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ partners: ['selected'], children: ['single-child'] }),
      ]));
  });

  it('offers every active partner, excludes former partners, and attaches the child to the chosen couple', () => {
    const people = ['selected', 'partner-a', 'partner-b', 'former'].map(person);
    const relationships = [
      { id: 'active-a', type: 'spouse', personAId: 'selected', personBId: 'partner-a' },
      { id: 'active-b', type: 'partner', personAId: 'selected', personBId: 'partner-b' },
      { id: 'former', type: 'divorced', personAId: 'selected', personBId: 'former' },
    ];
    const options = getChildCreationOptions(people, relationships, 'selected');

    expect(options.map((option) => option.partnerId || option.type))
      .toEqual(['partner-a', 'partner-b', 'new-partner']);

    const result = addChildToExistingCouple({
      people,
      relationships,
      selectedId: 'selected',
      partnerId: 'partner-b',
      person: person('couple-child'),
    });
    const family = buildFamilyUnits(result.people, result.relationships).familyUnits
      .find((item) => item.children.includes('couple-child'));
    expect(family.partners).toEqual(expect.arrayContaining(['selected', 'partner-b']));
  });

  it('creates and lays out a new partner and child as one family', () => {
    const result = addChildWithNewPartner({
      people: [person('selected')],
      relationships: [],
      selectedId: 'selected',
      newPartner: person('new-partner'),
      child: person('new-child'),
    });
    const family = buildFamilyUnits(result.people, result.relationships).familyUnits
      .find((item) => item.children.includes('new-child'));
    const layout = buildFamilyTreeLayout(result.people, result.relationships);
    const selectedX = layout.positions.get('selected').x;
    const partnerX = layout.positions.get('new-partner').x;

    expect(family.partners).toEqual(expect.arrayContaining(['selected', 'new-partner']));
    expect(Math.abs(selectedX - partnerX)).toBe(TREE_CARD_WIDTH + PARTNER_GAP);
    expect(layout.positions.get('new-child').y).toBeGreaterThan(layout.positions.get('selected').y);
  });
});
