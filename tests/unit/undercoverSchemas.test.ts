import assert from 'node:assert/strict';
import test from 'node:test';
import {
  undercoverSpeechSchema,
  undercoverStartSchema,
  undercoverVoteSchema,
} from '../../packages/shared/schemas/undercover';

test('undercover start requires six unique positive player ids', () => {
  assert.equal(undercoverStartSchema.safeParse({ playerIds: [1, 2, 3, 4, 5, 6] }).success, true);
  assert.equal(undercoverStartSchema.safeParse({ playerIds: [1, 2, 3, 4, 5] }).success, false);
  assert.equal(undercoverStartSchema.safeParse({ playerIds: [1, 2, 3, 4, 5, 5] }).success, false);
});

test('undercover AI contracts bound speech and vote reason', () => {
  assert.equal(undercoverSpeechSchema.safeParse({ speech: '正常发言' }).success, true);
  assert.equal(undercoverSpeechSchema.safeParse({ speech: 'x'.repeat(121) }).success, false);
  assert.equal(undercoverVoteSchema.safeParse({ targetId: 2, reason: '描述最可疑' }).success, true);
  assert.equal(undercoverVoteSchema.safeParse({ targetId: 2, reason: 'x'.repeat(81) }).success, false);
});
