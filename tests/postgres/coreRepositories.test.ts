import assert from 'node:assert/strict';
import test from 'node:test';
import { setDbExecutorForTests } from '../../packages/server/db';
import { migratePostgres } from '../../packages/server/db/postgres/migrate';
import * as authRepo from '../../packages/server/modules/auth/repository';
import * as settingsRepo from '../../packages/server/modules/settings/repository';
import * as skinRepo from '../../packages/server/modules/skins/repository';
import * as providerRepo from '../../packages/server/modules/model-providers/repository';
import * as modelRepo from '../../packages/server/modules/models/repository';
import * as voiceRepo from '../../packages/server/modules/voices/repository';
import * as playerRepo from '../../packages/server/modules/players/repository';
import * as werewolfRepo from '../../packages/server/modules/werewolf-config/repository';
import { withTestSchema } from './helpers';

test('core configuration repositories perform PostgreSQL CRUD', async () => {
  await withTestSchema(async (database) => {
    await migratePostgres(database);
    setDbExecutorForTests(database);
    try {
      const adminId = await authRepo.create('admin', 'hash-1', 'Administrator');
      assert.equal((await authRepo.findByUsername('admin'))?.id, adminId);
      await authRepo.updatePassword(adminId, 'hash-2');
      assert.equal((await authRepo.findById(adminId))?.password_hash, 'hash-2');
      assert.equal(await authRepo.countAll(), 1);

      await settingsRepo.upsertSetting('spectator_mode', 'true');
      assert.equal(await settingsRepo.getSettingValue('spectator_mode'), 'true');

      await skinRepo.insertSkin({
        id: 'classic', name: 'Classic', version: 'v1', source: 'test',
        terms_json: '{}', background: 'bg', truth: '', clues_json: '[]',
        noises_json: '[]', memory_examples_json: '[]', enabled: 1,
        created_at: '', updated_at: '',
      });
      assert.equal((await skinRepo.findSkinById('classic'))?.name, 'Classic');

      const providerId = await providerRepo.insertModelProvider({
        name: 'Provider', base_url: 'https://example.test', api_format: 'openai-compatible',
        api_key_cipher: '', api_key_iv: '', api_key_tag: '', enabled: 1,
      });
      const modelId = await modelRepo.insertModel({
        provider_id: providerId, provider: 'Provider', name: 'model-1', display_name: 'Model 1',
        base_url: '', api_format: 'openai-compatible', api_key_cipher: '', api_key_iv: '',
        api_key_tag: '', thinking_enabled: 0, enabled: 1, disabled_reason: null, disabled_at: null,
      });
      const voiceId = await voiceRepo.insertVoice({
        name: 'Voice', provider: 'browser', voice_id: 'voice-1', language: 'zh-CN', gender: '',
        style: '', rate: '0%', pitch: '0%', temperature: 0.85, sample_text: '', description: '', enabled: 1,
      });
      await playerRepo.insertPlayer({
        id: 1, nickname: 'Player', name: '', avatar: '', sex: '未知', personality: '',
        provider: 'Provider', model: 'model-1', model_id: modelId, fallback_model_id: null,
        voice_package_id: voiceId, temperature: 0.85, enabled: 1, sort_order: 1,
      });
      assert.equal((await playerRepo.findPlayerById(1))?.model_id, modelId);

      await werewolfRepo.insertRole({
        id: 'villager', name: 'Villager', faction: 'good', role_type: 'villager',
        responsibility: '', ability: '', play_style_advice: '', key_info: '',
        rule_json: '{}', enabled: 1, sort_order: 1,
      });
      await werewolfRepo.insertMode({
        id: 'standard', name: 'Standard', description: '', roles_json: '["villager"]',
        rules_json: '{}', sheriff_json: '{}', win_condition: 'side', enabled: 1, sort_order: 1,
      });
      assert.equal(await werewolfRepo.countModesByRoleId('villager'), 1);
    } finally {
      setDbExecutorForTests(null);
    }
  });
});
