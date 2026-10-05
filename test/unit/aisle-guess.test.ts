import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessAisle } from '../../src/app/models/aisle-guess.ts';

test('quick-add guesses the aisle from the item name', () => {
  assert.equal(guessAisle('חלב'), 'Dairy & Eggs');
  assert.equal(guessAisle('קמח לבן'), 'Pantry');
  assert.equal(guessAisle('פלפל שחור'), 'Spices & Sauces');
  assert.equal(guessAisle('פלפל אדום'), 'Fruits & Vegetables');
  assert.equal(guessAisle('דגני בוקר'), 'Pantry');
  assert.equal(guessAisle('  נייר   טואלט '), 'Household');
  assert.equal(guessAisle('בשר טחון'), 'Meat & Fish');
  assert.equal(guessAisle('משהו אחר'), 'Other');
});
