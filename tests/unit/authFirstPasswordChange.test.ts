import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('admin frontend has a forced password-change route and login redirect', () => {
  const root = process.cwd();
  const pagePath = `${root}/packages/admin/src/pages/ChangePassword/index.tsx`;
  assert.equal(fs.existsSync(pagePath), true);
  assert.match(fs.readFileSync(`${root}/packages/admin/src/pages/Login/index.tsx`, 'utf8'), /mustChangePassword/);
  assert.match(fs.readFileSync(`${root}/packages/admin/src/components/AdminPage/index.tsx`, 'utf8'), /change-password/);
});

test('login uses the supported borderless Card variant', () => {
  const source = fs.readFileSync(`${process.cwd()}/packages/admin/src/pages/Login/index.tsx`, 'utf8');
  assert.match(source, /variant="borderless"/);
  assert.doesNotMatch(source, /bordered=/);
});
