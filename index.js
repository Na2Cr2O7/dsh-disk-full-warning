/**
 * Host half of @local/dsh-disk-full-warning (dsh 0.2.2).
 *
 * Registers the `warn_disk_full` tool and the rule that teaches the model when
 * to call it. The tool does two things:
 *   1. `exec.concludeTurn()` marks the result as terminal, so the agent loop
 *      closes the turn right after committing this result (a hard stop, not a
 *      polite "please stop" in the result text).
 *   2. `presentationMeta` projects the cleanup target into the durable
 *      `tool/result` meta; the Client Toolview reads it back and renders the
 *      full-screen modal.
 *
 * Deliberately zero imports: a locally installed profile bundle resolves its
 * own dependencies from the profile's node_modules, which contains only
 * bundles. The object below is the exact ToolDefinition shape that
 * `ctx.tools.register()` accepts (the same shape `defineTool()` produces).
 * Keeping it dependency-free makes the plugin load on any dsh 0.2.x install.
 */

export const TOOL_NAME = 'warn_disk_full';
export const META_KIND = 'disk-full-warning';
export const PLUGIN_NAME = 'disk-full-warning';

const MAX_TARGET = 500;
const MAX_REASON = 600;
const MAX_ADVICE = 1000;
const MAX_EXTRA = 8;

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function cleanTargets(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = cleanText(item, MAX_TARGET);
    if (!text || result.includes(text)) continue;
    result.push(text);
    if (result.length >= MAX_EXTRA) break;
  }
  return result;
}

/**
 * Shared contract (pure): normalize model arguments into the canonical tool
 * value. The Client mirrors only the reading side of this shape, so both the
 * live run and a session replay render identically.
 */
export function buildWarningValue(args) {
  const raw = args && typeof args === 'object' ? args : {};
  const target = cleanText(raw.target, MAX_TARGET);
  if (!target) {
    throw new Error('warn_disk_full: `target` is required — name the exact directory or location the user should clean');
  }
  const extraTargets = cleanTargets(raw.extra_targets);
  const reason = cleanText(raw.reason, MAX_REASON);
  const advice = cleanText(raw.advice, MAX_ADVICE);

  return {
    text: [
      '已终止当前回合并弹出全屏清理提醒。',
      `建议清理：${target}`,
      extraTargets.length ? `其他位置：${extraTargets.join('、')}` : '',
      '等待用户清理磁盘空间后重新发起任务；不要重试命令，不要继续本回合。',
    ].filter(Boolean).join(' '),
    target,
    extra_targets: extraTargets,
    reason,
    advice,
    halted: true,
  };
}

/** Shared contract (pure): the browser-only projection, never model-visible. */
export function buildWarningMeta(value) {
  return {
    kind: META_KIND,
    version: 1,
    target: value.target,
    extraTargets: value.extra_targets,
    reason: value.reason,
    advice: value.advice,
    halted: value.halted === true,
  };
}

const PARAMETERS = {
  type: 'object',
  properties: {
    target: {
      type: 'string',
      description:
        'The single most important place to clean, chosen from the failed command and the project context. ' +
        'Use a concrete absolute path or an unambiguous location, e.g. "D:/project/node_modules/.cache", ' +
        '"/var/cache/apt/archives", "%TEMP% 下本次构建的临时文件", "系统盘下载目录里的旧安装包". ' +
        'Never leave it vague like "some temp files".',
    },
    extra_targets: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Optional additional places worth cleaning, ordered by expected space recovered (max 8). ' +
        'Each item must be a concrete path or clearly identifiable location.',
    },
    reason: {
      type: 'string',
      description:
        'Optional short summary of the failure that proved the disk is full: which command failed and the exact error ' +
        '(e.g. "npm install failed with ENOSPC: no space left on device").',
    },
    advice: {
      type: 'string',
      description:
        'Optional concrete cleanup guidance for the user: what can be deleted safely, roughly how much space it frees, ' +
        'and how to resume the task afterwards. Do not suggest deleting user data without warning.',
    },
  },
  required: ['target'],
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    target: { type: 'string' },
    extra_targets: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
    advice: { type: 'string' },
    halted: { type: 'boolean' },
  },
  required: ['text', 'target', 'extra_targets', 'reason', 'advice', 'halted'],
};

const TOOL_DESCRIPTION = [
  'Call this ONLY when you have confirmed that the current task failed because the disk is full / out of storage.',
  'It immediately ends the current turn (no retries, no further work) and opens a large full-screen modal that asks the user to free space.',
  'Trigger signals: ENOSPC, "No space left on device", "There is not enough space on the disk", "磁盘空间不足", or a write/install/build/download failure whose root cause is insufficient free space.',
  'You MUST fill `target` with the specific place to clean, inferred from the failed command and project context; `extra_targets`, `reason` and `advice` are optional but useful.',
  'After calling this tool, do not continue the conversation: the turn is ended by the tool itself.',
  'Do NOT call it for unrelated failures (network, permission, syntax errors, missing packages).',
].join(' ');

const WARNING_TOOL = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  parameters: PARAMETERS,
  output: {
    schema: OUTPUT_SCHEMA,
    render: (_args, value) => [{ type: 'text', text: value.text }],
    presentationMeta: (_args, value) => buildWarningMeta(value),
  },
  async execute(args, exec) {
    const value = buildWarningValue(args);
    // Hard stop: the pipeline marks this successful result with concludesTurn,
    // and the agent loop closes the turn after committing this result batch.
    if (exec && typeof exec.concludeTurn === 'function') exec.concludeTurn();
    return value;
  },
};

const PROMPT_SECTION = [
  '## Disk full -> call `warn_disk_full` immediately',
  'When a command or tool fails and the root cause is insufficient disk space (ENOSPC, "No space left on device",',
  '"There is not enough space on the disk", "磁盘空间不足", or any write/install/build/download error caused by a full disk):',
  '1. Call `warn_disk_full` at once. Do not retry the command, do not try workarounds, and do not continue any other work in this turn.',
  '2. `target` is required: infer the best place to clean from the failing command and project context, and give a concrete path or unambiguous location',
  '   (build output, dependency cache, package manager cache, temp directory, downloads, old images, logs, etc.).',
  '3. Optionally add `extra_targets`, `reason` (the original error), and `advice` (safe concrete cleanup steps).',
  '4. The tool itself terminates the turn. After calling it, output nothing more; do not write "I will continue" or "next steps".',
  'Only use this tool in the disk-full scenario described above; never for unrelated failures.',
].join('\n');

export const inject = ['tools', 'systemPrompt'];

export function apply(ctx) {
  ctx.effect(() => ctx.tools.register(WARNING_TOOL), `${PLUGIN_NAME}.tool`);
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'tool:disk-full-warning',
    order: 117,
    text: PROMPT_SECTION,
    interpolate: false,
  }), `${PLUGIN_NAME}.prompt`);
}
