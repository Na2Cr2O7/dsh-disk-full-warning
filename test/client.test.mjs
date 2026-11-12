/**
 * Contract tests for the Client half, without a browser.
 *
 * The Web client loads `client.js` through window.__ModuleLoader__.load(...).
 * We run that file in a VM with a minimal React/host stub and assert the parts
 * that actually matter: the module id, the keyed toolview registration, and
 * that a settled `warn_disk_full` result with a valid meta opens the modal —
 * while pending, failed, or already-seen results do not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const CLIENT_PATH = fileURLToPath(new URL('../client.js', import.meta.url));

function loadClientSpec(hostWindow = {}) {
  let spec;
  const sandbox = {
    window: {
      ...hostWindow,
      __ModuleLoader__: { load: (value) => { spec = value; } },
    },
  };
  vm.runInNewContext(readFileSync(CLIENT_PATH, 'utf8'), sandbox, { filename: 'client.js' });
  assert.ok(spec, 'client.js must register a ModuleLoader factory');
  return spec;
}

function makeHost() {
  const state = new Map();
  const portals = [];
  let hookIndex = 0;
  let effects = [];

  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity) };
    },
    useState(initial) {
      const key = hookIndex++;
      if (!state.has(key)) state.set(key, initial);
      return [state.get(key), (next) => {
        state.set(key, typeof next === 'function' ? next(state.get(key)) : next);
      }];
    },
    useEffect(fn, deps) { effects.push({ fn, deps }); },
    useRef(value) { return { current: value }; },
    useMemo(fn) { return fn(); },
  };

  const ReactDOM = {
    createPortal: (element, container) => {
      const portal = { portal: true, element, container };
      portals.push(portal);
      return portal;
    },
  };

  const storage = new Map();
  const win = {
    sessionStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    document: {
      body: { appendChild() {} },
      addEventListener() {},
      removeEventListener() {},
      createElement: () => ({ style: {}, select() {}, remove() {} }),
      execCommand: () => true,
    },
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };

  return {
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOM;
      throw new Error(`unexpected require: ${name}`);
    },
    win,
    portals,
    beginRender() { hookIndex = 0; effects = []; },
    runEffects() { for (const effect of effects) effect.fn(); },
  };
}

function collectElements(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const child of node) collectElements(child, out); return out; }
  if (node.portal) { collectElements(node.element, out); return out; }
  if ('type' in node) {
    out.push(node);
    if (typeof node.type === 'function') {
      // Expand function components the way React would, so their output is
      // inspectable without a real renderer.
      collectElements(node.type({ ...node.props, children: node.children }), out);
    }
    collectElements(node.children, out);
  }
  return out;
}

function hasClass(elements, name) {
  return elements.some((element) => typeof element.props.className === 'string'
    && element.props.className.split(' ').includes(name));
}

const VALID_META = {
  kind: 'disk-full-warning',
  version: 1,
  target: 'D:/demo/node_modules/.cache',
  extraTargets: ['D:/demo/dist', 'C:/Users/Nchu/AppData/Local/Temp'],
  reason: 'npm ERR! ENOSPC: no space left on device',
  advice: '删除缓存和旧构建产物后重试',
  halted: true,
};

/** Render one row twice (initial mount + the re-render caused by the mount effect). */
function renderRow(Component, props, host) {
  host.beginRender();
  const first = Component(props);
  host.runEffects();
  host.beginRender();
  const second = Component(props);
  return { first, second };
}

test('client module registers a keyed toolview for warn_disk_full', () => {
  const host = makeHost();
  const spec = loadClientSpec(host.win);
  assert.equal(spec.id, '@local/dsh-disk-full-warning');

  const module = spec.factory(host.require);
  assert.equal(Array.from(module.inject).join(','), 'slots');

  let injectedSlot;
  const registrations = [];
  module.apply({
    slots: {
      inject(name, factory) { injectedSlot = name; return factory(); },
      register(options, Component) { registrations.push({ options, Component }); return () => {}; },
    },
  });

  assert.equal(injectedSlot, 'tool.call.toolview');
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.name, 'tool.call.toolview');
  assert.equal(registrations[0].options.key, 'warn_disk_full');
  assert.equal(typeof registrations[0].Component, 'function');
});

test('a settled result with valid meta opens the full-screen modal', () => {
  const host = makeHost();
  const spec = loadClientSpec(host.win);
  const module = spec.factory(host.require);
  let Component;
  module.apply({ slots: { inject: (_n, f) => f(), register: (_o, c) => { Component = c; return () => {}; } } });

  renderRow(Component, {
    phase: 'result', callId: 'call-1', block: { isError: false, meta: VALID_META },
  }, host);

  assert.equal(host.portals.length, 1, 'exactly one modal portal must be created');
  assert.equal(host.win.sessionStorage.getItem('dsh-disk-full-warning:seen:call-1'), '1');

  const elements = collectElements(host.portals[0].element);
  assert.ok(hasClass(elements, 'dshdfw-card'), 'the modal card must be rendered');
  assert.ok(hasClass(elements, 'dshdfw-path'), 'the cleanup target box must be rendered');
  const texts = elements.flatMap((element) => element.children.filter((c) => typeof c === 'string'));
  assert.ok(texts.includes(VALID_META.target), 'the AI-chosen target must be visible');
  assert.ok(texts.includes('D:/demo/dist'), 'extra targets must be visible');
  assert.ok(texts.includes(VALID_META.reason), 'the failure reason must be visible');
});

test('pending, failed, wrong-kind and already-seen results do not auto-open', () => {
  const cases = [
    { label: 'preparing', props: { phase: 'preparing', callId: 'c2', block: {} } },
    { label: 'failed', props: { phase: 'result', callId: 'c3', block: { isError: true, meta: VALID_META } } },
    { label: 'missing meta', props: { phase: 'result', callId: 'c4', block: { isError: false } } },
    { label: 'wrong kind', props: { phase: 'result', callId: 'c5', block: { isError: false, meta: { ...VALID_META, kind: 'other' } } } },
    { label: 'empty target', props: { phase: 'result', callId: 'c6', block: { isError: false, meta: { ...VALID_META, target: '' } } } },
  ];

  for (const { label, props } of cases) {
    const host = makeHost();
    const spec = loadClientSpec(host.win);
    const module = spec.factory(host.require);
    let Component;
    module.apply({ slots: { inject: (_n, f) => f(), register: (_o, c) => { Component = c; return () => {}; } } });
    renderRow(Component, props, host);
    assert.equal(host.portals.length, 0, `${label}: no modal expected`);
  }

  // A callId already acknowledged in this browser session stays closed on replay.
  const host = makeHost();
  host.win.sessionStorage.setItem('dsh-disk-full-warning:seen:call-7', '1');
  const spec = loadClientSpec(host.win);
  const module = spec.factory(host.require);
  let Component;
  module.apply({ slots: { inject: (_n, f) => f(), register: (_o, c) => { Component = c; return () => {}; } } });
  renderRow(Component, {
    phase: 'result', callId: 'call-7', block: { isError: false, meta: VALID_META },
  }, host);
  assert.equal(host.portals.length, 0, 'replay of an acknowledged warning must not re-open');
});
