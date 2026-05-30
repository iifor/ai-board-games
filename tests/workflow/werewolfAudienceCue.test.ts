import test from 'node:test';
import assert from 'node:assert/strict';
import { WerewolfEventBus } from '../../packages/server/modules/werewolf/eventBus';
import { createGameEventBuilder } from '../../packages/server/modules/werewolf/gameEventBuilder';
import { createEventDeliverySubscriber } from '../../packages/server/modules/werewolf/eventDeliverySubscriber';

test('audience cue is preserved as flat socket event with text', async () => {
  const bus = new WerewolfEventBus();
  const delivered: Array<Record<string, unknown>> = [];
  const subscriber = createEventDeliverySubscriber(bus, (event) => {
    delivered.push(event);
  });
  subscriber.start();

  const builder = createGameEventBuilder('m-audience-cue');
  const event = builder
    .setStep('assign_roles')
    .setPhase('night')
    .setDay(1)
    .build('phase-changed', { text: '本局游戏：标准局。' }, 'public', undefined, {
      audienceCue: {
        kind: 'rule-intro',
        display: 'modal',
        speech: 'browser',
        textField: 'text',
        once: true
      }
    });

  await bus.publish(event);
  subscriber.stop();

  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].type, 'workflow-event');
  assert.equal(delivered[0].text, '本局游戏：标准局');
  assert.deepEqual(delivered[0].audienceCue, {
    kind: 'rule-intro',
    display: 'modal',
    speech: 'browser',
    textField: 'text',
    once: true
  });
});

