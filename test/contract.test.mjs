/**
 * Contract tests for the Host half of the plugin.
 * Run with: node --test
 *
 * These pin down the two things that must not drift:
 *  - the model can name the place to clean (target / extra_targets), and
 *  - a successful call always marks the turn as concluded (hard stop),
 *    while the browser projection stays separate from model-facing text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWarningValue,
  buildWarningMeta,
  apply,
  TOOL_NAME,
  META_KIND,
} from '../index.js';

function fakeContext() {
  const tools = [];
  const sections = [];
  return {
    tools,
    sections,
    ctx: {
      tools: { register: (definition) => { tools.push(definition); return () => {}; } },
      systemPrompt: { section: (section) => { sections.push(section); return () => {}; } },
      effect: (fn) => fn(),
    },
  };
}

test('target is required and surfaces the location chosen by the model', () => {
  assert.throws(() => buildWarningValue({}), /target/);
  assert.throws(() => buildWarningValue({ target: '   ' }), /target/);

  const value = buildWarningValue({
    target: 'D:/project/node_modules/.cache',
    extra_targets: ['%TEMP%/dsh-build-*', 'D:/project/dist', 'D:/project/dist'],
    reason: 'npm install failed with ENOSPC: no space left on device',
    advice: '删除 dist 与 npm 缓存后重新执行安装。',
  });

  assert.equal(value.target, 'D:/project/node_modules/.cache');
  assert.deepEqual(value.extra_targets, ['%TEMP%/dsh-build-*', 'D:/project/dist']);
  assert.equal(value.halted, true);
  assert.match(value.text, /不要重试命令/);
  assert.match(value.text, /D:\/project\/node_modules\/\.cache/);
});

test('messy arguments are normalized into a lossless, bounded value', () => {
  const value = buildWarningValue({
    target: '  C:/Users/me/AppData/Local/Temp  ',
    extra_targets: ['', 42, null, 'a', 'a'],
    reason: 123,
    advice: undefined,
  });
  assert.equal(value.target, 'C:/Users/me/AppData/Local/Temp');
  assert.deepEqual(value.extra_targets, ['a']);
  assert.equal(value.reason, '');
  assert.equal(value.advice, '');
  assert.equal(buildWarningValue({ target: 'x'.repeat(900) }).target.length, 501);
  assert.equal(buildWarningValue({ target: 'ok', extra_targets: Array.from({ length: 20 }, (_, i) => `p${i}`) }).extra_targets.length, 8);
});

test('presentation meta is browser-only and never leaks into model text', () => {
  const value = buildWarningValue({ target: '/var/cache/apt/archives', reason: 'ENOSPC' });
  const meta = buildWarningMeta(value);
  assert.equal(meta.kind, META_KIND);
  assert.equal(meta.version, 1);
  assert.equal(meta.target, '/var/cache/apt/archives');
  assert.equal(meta.reason, 'ENOSPC');
  assert.equal(meta.halted, true);
  assert.ok(!('text' in meta));
  assert.ok(!value.text.includes('disk-full-warning'));
});

test('registered tool concludes the turn and projects result + meta', async () => {
  const { ctx, tools, sections } = fakeContext();
  apply(ctx);
  assert.equal(tools.length, 1);
  assert.equal(sections.length, 1);

  const tool = tools[0];
  assert.equal(tool.name, TOOL_NAME);
  assert.match(tool.description, /disk is full/);
  assert.ok(tool.parameters.properties.target);
  assert.deepEqual(tool.parameters.required, ['target']);
  assert.equal(tool.output.schema.additionalProperties, false);

  let concluded = false;
  const value = await tool.execute(
    { target: '/tmp/build-cache', extra_targets: ['/tmp/old-logs'] },
    { concludeTurn: () => { concluded = true; } },
  );
  assert.equal(concluded, true, 'the tool must hard-stop the agent turn');
  assert.deepEqual(Object.keys(value).sort(), ['advice', 'extra_targets', 'halted', 'reason', 'target', 'text'].sort());

  const rendered = tool.output.render({}, value);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].type, 'text');
  assert.equal(rendered[0].text, value.text);

  const meta = tool.output.presentationMeta({}, value);
  assert.equal(meta.kind, META_KIND);
  assert.equal(meta.target, '/tmp/build-cache');
  assert.deepEqual(meta.extraTargets, ['/tmp/old-logs']);
});

test('system prompt teaches the ENOSPC trigger and the stop rule', () => {
  const { ctx, sections } = fakeContext();
  apply(ctx);
  const section = sections[0];
  assert.equal(section.name, 'tool:disk-full-warning');
  assert.equal(section.interpolate, false);
  assert.match(section.text, /ENOSPC/);
  assert.match(section.text, /warn_disk_full/);
  assert.match(section.text, /terminates the turn/);
});
