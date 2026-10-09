const assert = require('node:assert/strict');
const { FootballField } = require('../src/ui/field.js');

assert.equal(FootballField.position(0), 7);
assert.equal(FootballField.position(100), 92);
assert.equal(FootballField.position(50), 49.5);
assert.equal(FootballField.position(25), (FootballField.position(20) + FootballField.position(30)) / 2);
assert.equal(FootballField.position(105), FootballField.position(100), 'goal-to-go stops at the goal line');
const markings = FootballField.markings();
assert.match(markings, /left:49\.5%"><span>50<\/span>/);
assert.equal((markings.match(/class="yard-line"/g) || []).length, 11);
console.log('Field yardage projection and markings passed.');
