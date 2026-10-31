import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('@battle/admin App', () => {
  it('renders the placeholder heading', () => {
    expect(renderToStaticMarkup(<App />)).toContain('AI 对战 · 管理后台');
  });
});
