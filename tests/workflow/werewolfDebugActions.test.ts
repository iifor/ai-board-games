import test from 'node:test';
import assert from 'node:assert/strict';
import { debugSpeech, isWerewolfDebugMode, runDebugHunterAction, runDebugWerewolfAction, runDebugSelfDestructAction } from '../../packages/server/modules/werewolf/debugActions';

test('debug werewolf speech uses fixed faction text without player agent', () => {
  const runtime = createRuntime();
  const wolf = runtime.agents[1];
  const villager = runtime.agents[0];

  assert.equal(isWerewolfDebugMode({ state: { debugMode: true }, config: {} }), true);
  assert.equal(debugSpeech(wolf), '2号发言');
  assert.equal(debugSpeech(villager), '1号发言');
  assert.deepEqual(runDebugWerewolfAction(runtime, createRound(), wolf, 'day_speech'), {
    text: '2号发言',
    thinking: ''
  });
  assert.deepEqual(runDebugWerewolfAction(runtime, createRound(), wolf, 'wolf_speech'), {
    speech: '2号发言',
    thinking: ''
  });
});

test('debug werewolf actions choose deterministic legal payloads', () => {
  const runtime = createRuntime();
  const round = createRound();
  const wolf = runtime.agents[1];
  const villager = runtime.agents[0];

  // wolf_vote: should pick a non-wolf, non-self target (id=1 or id=3)
  const wolfVote = runDebugWerewolfAction(runtime, round, wolf, 'wolf_vote');
  assert.ok(wolfVote.target === 1 || wolfVote.target === 3, 'wolf_vote should pick non-wolf target');
  assert.notEqual(wolfVote.target, 2, 'wolf_vote should not pick self');

  // wolf_kill: should pick a non-wolf, non-self target
  const wolfKill = runDebugWerewolfAction(runtime, round, wolf, 'wolf_kill');
  assert.ok(wolfKill.target === 1 || wolfKill.target === 3, 'wolf_kill should pick non-wolf target');
  assert.equal(typeof wolfKill.speech, 'string', 'wolf_kill should include speech');
  assert.equal(typeof wolfKill.thinking, 'string', 'wolf_kill should include thinking');

  // seer_check: should pick any non-self target
  const seerCheck = runDebugWerewolfAction(runtime, round, villager, 'seer_check');
  assert.ok(seerCheck.target === 2 || seerCheck.target === 3, 'seer_check should pick non-self target');
  assert.ok(seerCheck.result === '狼人' || seerCheck.result === '好人', 'seer_check should return faction');

  // witch_save: should not use (no wolfTarget in round)
  assert.deepEqual(runDebugWerewolfAction(runtime, round, villager, 'witch_save'), { use: false });

  // witch_poison: should return valid structure
  const witchPoison = runDebugWerewolfAction(runtime, round, villager, 'witch_poison');
  assert.ok(typeof witchPoison.use === 'boolean', 'witch_poison should have use field');

  // sheriff_signup: should return valid structure
  const sheriffSignup = runDebugWerewolfAction(runtime, round, villager, 'sheriff_signup');
  assert.ok(typeof sheriffSignup.run === 'boolean', 'sheriff_signup should have run field');

  // day_vote: should pick non-self target
  const dayVote = runDebugWerewolfAction(runtime, round, villager, 'day_vote');
  assert.ok(dayVote.target === 2 || dayVote.target === 3, 'day_vote should pick non-self target');
});

test('debug hunter shot does not call skills and picks first alive target', () => {
  const runtime = createRuntime();
  // hunter is agent[2] (id=3), should pick a non-self alive target (id=1 or id=2)
  const result = runDebugHunterAction(runtime, runtime.agents[2]);
  assert.ok(result.target === 1 || result.target === 2, 'hunter should pick non-self alive target');
  assert.notEqual(result.target, 3, 'hunter should not pick self');
});

test('debug guard protect includes reason and respects lastGuardTarget', () => {
  const runtime = createRuntime();
  const round = createRound();
  const guard = runtime.agents[0]; // id=1, good faction

  // 首次守护：无 lastGuardTarget 限制，应返回 reason
  const result1 = runDebugWerewolfAction(runtime, round, guard, 'guard_protect') as Record<string, unknown>;
  assert.ok(result1.target === 2 || result1.target === 3, 'guard should pick a non-self target');
  assert.ok(typeof result1.reason === 'string', 'guard result should include reason');
  assert.ok(String(result1.reason).startsWith('debug-守'), 'reason should start with debug-守');

  // 空守测试：所有其他玩家都是 lastGuardTarget 时回退
  const guardWithHistory = { ...guard, lastGuardTarget: 2 };
  const result2 = runDebugWerewolfAction(runtime, round, guardWithHistory, 'guard_protect') as Record<string, unknown>;
  assert.ok(typeof result2.reason === 'string', 'guard result with history should include reason');
});

test('debug white wolf king day_speech can trigger self-destruct', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' },
      { id: 3, alive: true, faction: 'good' }
    ]
  };
  const round = createRound();
  const whiteWolfKing = runtime.agents[1];

  // 多次运行验证自爆逻辑存在（概率触发）
  let selfDestructTriggered = false;
  for (let i = 0; i < 50; i++) {
    const result = runDebugWerewolfAction(runtime, round, whiteWolfKing, 'day_speech') as Record<string, unknown>;
    assert.ok(typeof result.text === 'string', 'day_speech should always have text');
    if (result.selfDestruct === true) {
      selfDestructTriggered = true;
      assert.ok(result.target === 1 || result.target === 3, 'self-destruct target should be a non-wolf alive player');
      assert.ok(typeof result.selfDestructText === 'string', 'self-destruct should have text');
      break;
    }
  }
  assert.ok(selfDestructTriggered, 'white wolf king self-destruct should trigger at least once in 50 attempts');
});

test('debug white wolf king day_speech self-destruct chance is 15 percent', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' },
      { id: 3, alive: true, faction: 'good' }
    ]
  };
  const whiteWolfKing = runtime.agents[1];

  withMockRandom(0.15, () => {
    const result = runDebugWerewolfAction(runtime, createRound(), whiteWolfKing, 'day_speech') as Record<string, unknown>;
    assert.equal(result.selfDestruct, undefined);
  });
  withMockRandom(0.14, () => {
    const result = runDebugWerewolfAction(runtime, createRound(), whiteWolfKing, 'day_speech') as Record<string, unknown>;
    assert.equal(result.selfDestruct, true);
  });
});

test('debug self-destruct action returns valid payload', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' },
      { id: 3, alive: true, faction: 'good' }
    ]
  };
  const whiteWolfKing = runtime.agents[1];

  // 多次运行验证独立自爆函数
  let usedOnce = false;
  let notUsedOnce = false;
  for (let i = 0; i < 50; i++) {
    const result = runDebugSelfDestructAction(runtime, whiteWolfKing) as Record<string, unknown>;
    if (result.use === true) {
      usedOnce = true;
      assert.ok(result.target === 1 || result.target === 3, 'self-destruct target should be non-wolf');
      assert.ok(typeof result.text === 'string' && String(result.text).length > 0, 'self-destruct text should be non-empty');
    } else {
      notUsedOnce = true;
      assert.equal(result.target, null, 'no self-destruct means no target');
    }
  }
  assert.ok(usedOnce, 'self-destruct should trigger at least once in 50 attempts');
  assert.ok(notUsedOnce, 'self-destruct should not trigger at least once in 50 attempts');
});

test('debug self-destruct rejects non-wolf actors', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' }
    ]
  };
  const villager = runtime.agents[0];
  const result = runDebugSelfDestructAction(runtime, villager);
  assert.deepEqual(result, { use: false, text: '', target: null });
});

test('debug self-destruct rejects dead actors', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: false, faction: 'wolves', role: 'white_wolf_king' }
    ]
  };
  const deadWolf = runtime.agents[1];
  const result = runDebugSelfDestructAction(runtime, deadWolf);
  assert.deepEqual(result, { use: false, text: '', target: null });
});

test('debug optional special roles can skip skills by probability', () => {
  withMockRandom(0.99, () => {
    const runtime = {
      agents: [
        { id: 1, alive: true, faction: 'good', role: 'knight' },
        { id: 2, alive: true, faction: 'wolves', role: 'white_wolf_king' },
        { id: 3, alive: true, faction: 'good', role: 'butterfly' },
      ]
    };
    const round = createRound();

    assert.deepEqual(runDebugWerewolfAction(runtime, round, runtime.agents[0], 'knight_duel'), { target: null, reason: 'debug-skip' });
    assert.deepEqual(runDebugWerewolfAction(runtime, round, runtime.agents[2], 'butterfly_hug'), { target: null, reason: 'debug-skip' });
    assert.deepEqual(runDebugSelfDestructAction(runtime, runtime.agents[1]), { use: false, text: '', target: null });
  });
});

test('debug dreamer action picks a legal target', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good', role: 'dreamer' },
      { id: 2, alive: true, faction: 'wolves' },
      { id: 3, alive: true, faction: 'good' },
    ],
  };
  const result = runDebugWerewolfAction(runtime, createRound(), runtime.agents[0], 'dreamer_dream') as Record<string, unknown>;

  assert.ok(result.target === 2 || result.target === 3, 'dreamer should pick a non-self alive target');
  assert.equal(result.reason, 'debug-random');
});

test('debug spirit wolf actions return legal payloads', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'wolves', role: 'spirit_wolf' },
      { id: 2, alive: true, faction: 'good', role: 'seer' },
      { id: 3, alive: true, faction: 'good', role: 'villager' },
    ],
  };
  const round = createRound();

  const learn = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'spirit_wolf_learn') as Record<string, unknown>;
  assert.ok(learn.target === 2 || learn.target === 3);

  withMockRandom(0, () => {
    const inspect = runDebugWerewolfAction(runtime, { ...round, day: 2 }, runtime.agents[0], 'spirit_wolf_inspect') as Record<string, unknown>;
    assert.ok(inspect.target === 2 || inspect.target === 3);
    const guard = runDebugWerewolfAction(runtime, { ...round, day: 2 }, runtime.agents[0], 'spirit_wolf_guard') as Record<string, unknown>;
    assert.ok([1, 2, 3].includes(Number(guard.target)));
  });

  const antidote = runDebugWerewolfAction(runtime, { ...round, night: { witchPoisonTarget: 2 } }, runtime.agents[0], 'spirit_wolf_antidote') as Record<string, unknown>;
  assert.equal(antidote.use, true);
  assert.equal(antidote.target, 2);
});

test('debug magician action picks two legal unused targets', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'good', role: 'magician', magicianSwappedIds: [4] },
      { id: 2, alive: true, faction: 'wolves', role: 'werewolf' },
      { id: 3, alive: true, faction: 'good', role: 'villager' },
      { id: 4, alive: true, faction: 'good', role: 'villager' },
    ],
  };

  const result = runDebugWerewolfAction(runtime, createRound(), runtime.agents[0], 'magician_swap') as Record<string, unknown>;

  assert.ok(result.target === 2 || result.target === 3);
  assert.ok(result.secondTarget === 2 || result.secondTarget === 3);
  assert.notEqual(result.target, result.secondTarget);
});

test('debug modes 14 to 16 actions return legal payloads', () => {
  withMockRandom(0.1, () => {
    const runtime = {
      agents: [
        { id: 1, alive: true, faction: 'good', role: 'fortune_teller' },
        { id: 2, alive: true, faction: 'wolves', role: 'big_bad_wolf' },
        { id: 3, alive: true, faction: 'good', role: 'crow', lastCrowTarget: 4 },
        { id: 4, alive: true, faction: 'good', role: 'bear_tamer' },
        { id: 5, alive: true, faction: 'wolves', role: 'werewolf' },
        { id: 6, alive: true, faction: 'good', role: 'villager' },
      ]
    };
    const round = createRound();

    const mark = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'fortune_teller_mark') as Record<string, unknown>;
    const soloKill = runDebugWerewolfAction(runtime, round, runtime.agents[1], 'big_bad_wolf_kill') as Record<string, unknown>;
    const curse = runDebugWerewolfAction(runtime, round, runtime.agents[2], 'crow_curse') as Record<string, unknown>;
    const roar = runDebugWerewolfAction(runtime, round, runtime.agents[3], 'bear_tamer_roar') as Record<string, unknown>;

    assert.ok(mark.target && Number(mark.target) !== 1);
    assert.ok(soloKill.target && ![2, 5].includes(Number(soloKill.target)));
    assert.ok(curse.target && Number(curse.target) !== 3 && Number(curse.target) !== 4);
    assert.equal(roar.roaring, true);
    assert.deepEqual(roar.adjacentWolfIds, [5]);
  });
});

test('debug modes 23 to 24 actions return legal payloads', () => {
  withMockRandom(0.1, () => {
    const runtime = {
      agents: [
        { id: 1, alive: true, faction: 'wolves', role: 'wolf_seed' },
        { id: 2, alive: true, faction: 'wolves', role: 'werewolf' },
        { id: 3, alive: true, faction: 'good', role: 'heavenly_eye' },
        { id: 4, alive: true, faction: 'good', role: 'requester' },
        { id: 5, alive: true, faction: 'good', role: 'villager' },
      ]
    };
    const round = createRound();
    round.night.wolfTarget = 5;
    runtime.agents[3].requesterGift = 'soloKill';

    const infect = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'wolf_seed_infect') as Record<string, unknown>;
    const eye = runDebugWerewolfAction(runtime, round, runtime.agents[2], 'heavenly_eye_check') as Record<string, unknown>;
    const pray = runDebugWerewolfAction(runtime, round, runtime.agents[3], 'requester_pray') as Record<string, unknown>;
    const kill = runDebugWerewolfAction(runtime, round, runtime.agents[3], 'requester_kill') as Record<string, unknown>;

    assert.equal(infect.use, true);
    assert.ok(eye.target && Number(eye.target) !== 3);
    assert.ok(pray.target && Number(pray.target) !== 4);
    assert.ok(kill.target && Number(kill.target) !== 4);
  });
});

test('debug modes 25 to 26 actions return legal payloads', () => {
  withMockRandom(0.1, () => {
    const runtime = {
      agents: [
        { id: 1, alive: true, faction: 'good', role: 'thief' },
        { id: 2, alive: true, faction: 'good', role: 'cupid' },
        { id: 3, alive: true, faction: 'wolves', role: 'succubus' },
        { id: 4, alive: true, faction: 'wolves', role: 'werewolf' },
        { id: 5, alive: true, faction: 'good', role: 'villager' },
      ],
      modeConfig: { thiefOfferedRoleIds: ['werewolf', 'villager'] },
    };
    const round = createRound();

    const thief = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'thief_choose') as Record<string, unknown>;
    const cupid = runDebugWerewolfAction(runtime, round, runtime.agents[1], 'cupid_link') as Record<string, unknown>;
    const succubus = runDebugWerewolfAction(runtime, round, runtime.agents[2], 'succubus_link') as Record<string, unknown>;

    assert.equal(thief.roleId, 'werewolf');
    assert.deepEqual(thief.offeredRoleIds, ['werewolf', 'villager']);
    assert.ok(cupid.target && cupid.secondTarget && cupid.target !== cupid.secondTarget);
    assert.notEqual(cupid.target, 2);
    assert.notEqual(cupid.secondTarget, 2);
    assert.ok([1, 2, 5].includes(Number(succubus.target)));
    assert.notEqual(succubus.target, 3);
    assert.notEqual(succubus.target, 4);
  });
});

test('debug mode 27 ghost bride actions return legal payloads', () => {
  withMockRandom(0.1, () => {
    const runtime = {
      agents: [
        { id: 1, alive: true, faction: 'third_party', role: 'ghost_bride', ghostBridePartnerId: 2, ghostBrideWitnessId: 3 },
        { id: 2, alive: true, faction: 'third_party', role: 'villager', ghostBridePartnerId: 1, ghostBrideWitnessId: 3 },
        { id: 3, alive: true, faction: 'third_party', role: 'hunter', witnessForGhostBride: 1 },
        { id: 4, alive: false, faction: 'wolves', role: 'werewolf' },
        { id: 5, alive: true, faction: 'good', role: 'villager' },
      ],
    };
    const round = createRound();

    const link = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'ghost_bride_link') as Record<string, unknown>;
    const chat = runDebugWerewolfAction(runtime, round, runtime.agents[1], 'ghost_bride_chat') as Record<string, unknown>;
    const kill = runDebugWerewolfAction(runtime, round, runtime.agents[2], 'ghost_bride_kill') as Record<string, unknown>;

    assert.ok(link.target && link.witnessId && link.target !== link.witnessId);
    assert.notEqual(link.target, 1);
    assert.notEqual(link.witnessId, 1);
    assert.equal(typeof chat.text, 'string');
    assert.equal(kill.target, 5);
  });
});

test('debug mode 30 magic wolf and demon hunter actions return legal payloads', () => {
  withMockRandom(0.1, () => {
    const runtime = {
      agents: [
        { id: 1, alive: true, faction: 'wolves', role: 'magic_wolf' },
        { id: 2, alive: true, faction: 'good', role: 'demon_hunter' },
        { id: 3, alive: true, faction: 'good', role: 'seer' },
      ],
    };
    const dayOne = createRound();
    const dayTwo = createRound();
    dayTwo.day = 2;

    const dayOneHunt = runDebugWerewolfAction(runtime, dayOne, runtime.agents[1], 'demon_hunter_hunt') as Record<string, unknown>;
    const dayTwoHunt = runDebugWerewolfAction(runtime, dayTwo, runtime.agents[1], 'demon_hunter_hunt') as Record<string, unknown>;
    const selfDestruct = runDebugSelfDestructAction(runtime, runtime.agents[0]) as Record<string, unknown>;

    assert.deepEqual(dayOneHunt, { target: null, reason: 'debug-skip' });
    assert.ok(dayTwoHunt.target === 1 || dayTwoHunt.target === 3);
    assert.notEqual(dayTwoHunt.target, 2);
    assert.equal(dayTwoHunt.reason, 'debug-demon-hunter');
    assert.equal(selfDestruct.use, true);
    assert.equal(selfDestruct.target, null);
    assert.match(String(selfDestruct.text), /魔狼自爆/);
  });
});

test('debug mode 29 hunter speech, vote, and witch save use the escape hunt target', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'hunters', role: 'escape_hunter' },
      { id: 2, alive: true, faction: 'hunters', role: 'escape_hunter' },
      { id: 3, alive: true, faction: 'good', role: 'thick_wolf' },
      { id: 4, alive: true, faction: 'good', role: 'witch' },
    ],
  };
  const round = { ...createRound(), night: { escapeHunterTarget: 3 } };

  const speech = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'escape_hunter_speech');
  const vote = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'escape_hunter_vote');
  const save = withMockRandomResult(0, () => runDebugWerewolfAction(runtime, round, runtime.agents[3], 'witch_save'));

  assert.equal(typeof speech.text, 'string');
  assert.ok(vote.target === 3 || vote.target === 4);
  assert.equal(save.use, true);
});

test('debug self-destruct rejects ordinary wolves without self-destruct role action', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'wolves', role: 'werewolf' },
      { id: 2, alive: true, faction: 'good' },
    ],
  };

  assert.deepEqual(runDebugSelfDestructAction(runtime, runtime.agents[0]), { use: false, text: '', target: null });
});

test('debug mode 32 wolf witch and illusionist actions return legal payloads', () => {
  const runtime = {
    agents: [
      { id: 1, alive: true, faction: 'wolves', role: 'wolf_witch' },
      { id: 2, alive: true, faction: 'good', role: 'illusionist' },
      { id: 3, alive: true, faction: 'good', role: 'seer' },
      { id: 4, alive: true, faction: 'good', role: 'villager' },
    ],
  };
  const round = createRound();

  withMockRandom(0.1, () => {
    const curse = runDebugWerewolfAction(runtime, round, runtime.agents[0], 'wolf_witch_curse') as Record<string, unknown>;
    const illusion = runDebugWerewolfAction(runtime, round, runtime.agents[1], 'illusionist_illusion') as Record<string, unknown>;

    assert.ok([2, 3, 4].includes(Number(curse.target)));
    assert.equal(curse.reason, 'debug-wolf-witch');
    assert.ok([1, 3, 4].includes(Number(illusion.target)));
    assert.equal(illusion.reason, 'debug-illusionist');
  });

  withMockRandom(0.99, () => {
    assert.deepEqual(runDebugWerewolfAction(runtime, round, runtime.agents[0], 'wolf_witch_curse'), { target: null, reason: 'debug-skip' });
    assert.deepEqual(runDebugWerewolfAction(runtime, round, runtime.agents[1], 'illusionist_illusion'), { target: null, reason: 'debug-skip' });
  });
});

function createRuntime() {
  return {
    agents: [
      { id: 1, alive: true, faction: 'good' },
      { id: 2, alive: true, faction: 'wolves' },
      { id: 3, alive: true, faction: 'good' }
    ]
  };
}

function createRound() {
  return {
    day: 1,
    night: {},
    sheriffElection: { candidates: [2, 3], runoffCandidateIds: [3] }
  };
}

function withMockRandom(value: number, run: () => void): void {
  const original = Math.random;
  Math.random = () => value;
  try {
    run();
  } finally {
    Math.random = original;
  }
}

function withMockRandomResult<T>(value: number, run: () => T): T {
  const original = Math.random;
  Math.random = () => value;
  try {
    return run();
  } finally {
    Math.random = original;
  }
}
