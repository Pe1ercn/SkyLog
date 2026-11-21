import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGAL_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_AUTHOR,
  USER_AGREEMENT,
  DISCLAIMER,
} from '../../src/data/legal.js';

test('legal documents have version, effective date and creator metadata', () => {
  assert.equal(LEGAL_VERSION, '1.0');
  assert.equal(LEGAL_EFFECTIVE_DATE, '2026-11-22');
  assert.equal(LEGAL_AUTHOR, 'Pe1er');
  assert.equal(USER_AGREEMENT.version, LEGAL_VERSION);
  assert.equal(DISCLAIMER.version, LEGAL_VERSION);
  assert.equal(USER_AGREEMENT.effectiveDate, LEGAL_EFFECTIVE_DATE);
  assert.equal(DISCLAIMER.effectiveDate, LEGAL_EFFECTIVE_DATE);
});

test('user agreement covers the required lifecycle and risk sections', () => {
  const headings = USER_AGREEMENT.sections.map((section) => section.heading).join('\n');
  for (const term of ['生效日期', '创作者', '软件性质', '资格', '安装', '第三方', '暂停', '法律适用']) {
    assert.match(headings, new RegExp(term));
  }
  const text = USER_AGREEMENT.sections.map((section) => section.body).join('\n');
  assert.match(text, /Pe1er/);
  assert.match(text, /DeepSeek/);
  assert.match(text, /不得用于真实航空器运行/);
  assert.match(text, /用户目录/);
  assert.match(text, /强制性规定/);
});

test('disclaimer preserves non-excludable statutory liability', () => {
  const headings = DISCLAIMER.sections.map((section) => section.heading).join('\n');
  for (const term of ['非官方', '现状', '风险', '责任边界', '不得排除', '使用选择']) {
    assert.match(headings, new RegExp(term));
  }
  const text = DISCLAIMER.sections.map((section) => section.body).join('\n');
  assert.match(text, /故意或重大过失/);
  assert.match(text, /消费者/);
  assert.match(text, /不排除/);
});
