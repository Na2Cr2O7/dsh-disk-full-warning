/**
 * Client half of @local/dsh-disk-full-warning (dsh 0.2.2 Web UI).
 *
 * Registers a keyed `tool.call.toolview` for `warn_disk_full`. The row stays
 * small (a durable replay anchor), while the actual warning is a large modal
 * rendered through ReactDOM.createPortal on document.body — the same mechanism
 * the shipped settings/approval panels use, so it covers the whole app.
 *
 * Data comes only from the persisted `block.meta` projection emitted by the
 * Host tool. No Node imports, no dynamic imports, no network calls: this file
 * is loaded as a single ModuleLoader factory by the Web client.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-disk-full-warning',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const TOOL_NAME = 'warn_disk_full';
    const META_KIND = 'disk-full-warning';
    const SEEN_PREFIX = 'dsh-disk-full-warning:seen:';

    const CSS = [
      '.dshdfw-row{display:flex;align-items:center;gap:10px;padding:10px 14px;margin:6px 0;border:.5px solid var(--dsw-alias-border-l2,rgba(20,24,32,.14));border-left:3px solid #e0533d;border-radius:10px;background:var(--dsw-alias-bg-module-platform,#fff);color:var(--dsw-alias-label-primary,#1b1f26);font-size:13px;line-height:20px}',
      '.dshdfw-rowMark{display:grid;place-items:center;flex:0 0 20px;width:20px;height:20px;border-radius:50%;background:#e0533d;color:#fff;font-weight:700;font-size:13px}',
      '.dshdfw-rowBody{min-width:0;flex:1}',
      '.dshdfw-rowTitle{font-weight:600}',
      '.dshdfw-rowSub{color:var(--dsw-alias-label-tertiary,#717a86);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshdfw-rowBtn{flex:none;border:.5px solid var(--dsw-alias-border-l2,rgba(20,24,32,.18));border-radius:999px;background:transparent;color:inherit;cursor:pointer;padding:3px 12px;font-size:12px;line-height:20px}',
      '.dshdfw-rowBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,24,32,.06))}',
      '.dshdfw-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;font-family:inherit;animation:dshdfw-fade .16s ease-out}',
      '.dshdfw-backdrop{position:absolute;inset:0;background:rgba(12,15,20,.58);backdrop-filter:blur(5px)}',
      '.dshdfw-card{position:relative;display:flex;flex-direction:column;width:min(760px,100%);max-height:min(86vh,780px);border-radius:20px;overflow:hidden;background:var(--dsw-alias-bg-module-platform,#fff);color:var(--dsw-alias-label-primary,#1b1f26);box-shadow:0 24px 80px rgba(0,0,0,.32);animation:dshdfw-rise .22s cubic-bezier(.2,.8,.2,1)}',
      '.dshdfw-head{display:flex;align-items:flex-start;gap:18px;padding:30px 32px 22px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(20,24,32,.1))}',
      '.dshdfw-icon{display:grid;place-items:center;flex:0 0 52px;width:52px;height:52px;border-radius:16px;background:#e0533d;color:#fff;font-size:31px;font-weight:700;line-height:1;box-shadow:0 8px 22px rgba(224,83,61,.32)}',
      '.dshdfw-headText{min-width:0;flex:1}',
      '.dshdfw-eyebrow{margin:0 0 6px;color:#e0533d;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}',
      '.dshdfw-title{margin:0;font-size:24px;font-weight:650;line-height:34px;letter-spacing:-.01em}',
      '.dshdfw-sub{margin:8px 0 0;color:var(--dsw-alias-label-secondary,#545b66);font-size:14px;line-height:22px}',
      '.dshdfw-x{flex:none;width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--dsw-alias-label-tertiary,#7a828d);cursor:pointer;font-size:20px;line-height:1}',
      '.dshdfw-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,24,32,.07));color:inherit}',
      '.dshdfw-body{padding:8px 32px 4px;overflow:auto;overscroll-behavior:contain}',
      '.dshdfw-sec{padding:18px 0;border-bottom:.5px solid var(--dsw-alias-border-l4,rgba(20,24,32,.07))}',
      '.dshdfw-sec:last-child{border-bottom:0}',
      '.dshdfw-label{margin:0 0 10px;color:var(--dsw-alias-label-tertiary,#7a828d);font-size:12px;font-weight:600;letter-spacing:.04em}',
      '.dshdfw-path{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border:.5px solid rgba(224,83,61,.35);border-radius:12px;background:var(--dsw-alias-markdown-code-block,rgba(224,83,61,.06))}',
      '.dshdfw-pathText{flex:1;min-width:0;margin:0;color:inherit;font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:15px;line-height:24px;font-weight:600;white-space:pre-wrap;word-break:break-all}',
      '.dshdfw-copy{flex:none;border:.5px solid var(--dsw-alias-border-l2,rgba(20,24,32,.2));border-radius:8px;background:var(--dsw-alias-bg-base,transparent);color:inherit;cursor:pointer;padding:5px 12px;font-size:12px;line-height:20px;white-space:nowrap}',
      '.dshdfw-copy:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,24,32,.06))}',
      '.dshdfw-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}',
      '.dshdfw-list li{display:flex;gap:10px;align-items:baseline;color:var(--dsw-alias-label-secondary,#545b66);font-size:14px;line-height:22px;word-break:break-all}',
      '.dshdfw-num{flex:none;display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--dsw-alias-bg-overlay,rgba(20,24,32,.08));font-size:11px;font-weight:700;color:var(--dsw-alias-label-secondary,#545b66)}',
      '.dshdfw-prose{margin:0;color:var(--dsw-alias-label-secondary,#545b66);font-size:14px;line-height:23px;white-space:pre-wrap;word-break:break-word}',
      '.dshdfw-quote{margin:0;padding:12px 16px;border-left:3px solid var(--dsw-alias-border-l2,rgba(20,24,32,.2));border-radius:0 8px 8px 0;background:var(--dsw-alias-markdown-code-block,rgba(20,24,32,.04));color:var(--dsw-alias-label-secondary,#545b66);font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:12.5px;line-height:21px;white-space:pre-wrap;word-break:break-word}',
      '.dshdfw-note{display:flex;gap:10px;align-items:flex-start;margin:18px 0 22px;padding:12px 16px;border-radius:10px;background:var(--dsw-alias-bg-overlay,rgba(20,24,32,.05));color:var(--dsw-alias-label-secondary,#545b66);font-size:12.5px;line-height:20px}',
      '.dshdfw-foot{display:flex;justify-content:flex-end;gap:12px;padding:18px 32px 26px;border-top:.5px solid var(--dsw-alias-border-l3,rgba(20,24,32,.1))}',
      '.dshdfw-btn{border-radius:10px;cursor:pointer;padding:10px 20px;font-size:14px;font-weight:600;line-height:22px}',
      '.dshdfw-btnGhost{border:.5px solid var(--dsw-alias-border-l2,rgba(20,24,32,.22));background:transparent;color:inherit}',
      '.dshdfw-btnGhost:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,24,32,.06))}',
      '.dshdfw-btnPrimary{border:1px solid #2f6fd0;background:#2f6fd0;color:#fff;box-shadow:0 6px 18px rgba(47,111,208,.28)}',
      '.dshdfw-btnPrimary:hover{background:#255fba;border-color:#255fba}',
      '@keyframes dshdfw-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes dshdfw-rise{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.dshdfw-overlay,.dshdfw-card{animation:none}}',
      '@media (max-width:620px){.dshdfw-overlay{padding:12px}.dshdfw-head{padding:22px 20px 18px;gap:12px}.dshdfw-icon{flex-basis:42px;width:42px;height:42px;font-size:25px}.dshdfw-title{font-size:19px;line-height:28px}.dshdfw-body{padding:4px 20px}.dshdfw-foot{padding:16px 20px 20px;flex-wrap:wrap}}',
    ].join('\n');

    function readWarningMeta(block) {
      if (!block || typeof block !== 'object' || block.isError === true) return null;
      const meta = block.meta;
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
      if (meta.kind !== META_KIND) return null;
      if (typeof meta.target !== 'string' || !meta.target.trim()) return null;
      return {
        target: meta.target,
        extraTargets: Array.isArray(meta.extraTargets)
          ? meta.extraTargets.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8)
          : [],
        reason: typeof meta.reason === 'string' ? meta.reason : '',
        advice: typeof meta.advice === 'string' ? meta.advice : '',
        halted: meta.halted === true,
      };
    }

    function Section(props) {
      return h('div', { className: 'dshdfw-sec' },
        h('p', { className: 'dshdfw-label' }, props.label),
        props.children,
      );
    }

    function WarningModal(props) {
      const { warning, onClose, onCopy, copied } = props;
      const panel = React.useRef(null);
      React.useEffect(() => {
        if (panel.current && typeof panel.current.focus === 'function') panel.current.focus();
      }, []);

      return h('div', { className: 'dshdfw-overlay', role: 'presentation' },
        h('div', { className: 'dshdfw-backdrop', 'aria-hidden': 'true' }),
        h('div', {
          ref: panel,
          tabIndex: -1,
          className: 'dshdfw-card',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'dshdfw-title',
          style: { outline: 'none' },
        },
          h('div', { className: 'dshdfw-head' },
            h('div', { className: 'dshdfw-icon', 'aria-hidden': 'true' }, '!'),
            h('div', { className: 'dshdfw-headText' },
              h('p', { className: 'dshdfw-eyebrow' }, 'Disk full · 磁盘空间不足'),
              h('h2', { className: 'dshdfw-title', id: 'dshdfw-title' }, '任务已暂停，请先清理磁盘空间'),
              h('p', { className: 'dshdfw-sub' },
                'AI 检测到本次任务失败的原因是磁盘已满，已立即停止当前对话，避免继续写入造成更多失败。下面是建议清理的位置。'),
            ),
            h('button', {
              type: 'button', className: 'dshdfw-x', 'aria-label': '关闭提醒', onClick: onClose,
            }, '×'),
          ),
          h('div', { className: 'dshdfw-body' },
            h(Section, { label: '建议清理的位置' },
              h('div', { className: 'dshdfw-path' },
                h('code', { className: 'dshdfw-pathText' }, warning.target),
                h('button', { type: 'button', className: 'dshdfw-copy', onClick: onCopy },
                  copied === 'ok' ? '已复制' : copied === 'fail' ? '复制失败' : '复制路径'),
              ),
            ),
            warning.extraTargets.length
              ? h(Section, { label: '其他可清理的位置' },
                  h('ul', { className: 'dshdfw-list' },
                    warning.extraTargets.map((item, index) =>
                      h('li', { key: `${index}:${item}` },
                        h('span', { className: 'dshdfw-num' }, String(index + 1)),
                        h('span', null, item),
                      ),
                    ),
                  ),
                )
              : null,
            warning.reason
              ? h(Section, { label: '失败原因' },
                  h('pre', { className: 'dshdfw-quote' }, warning.reason),
                )
              : null,
            warning.advice
              ? h(Section, { label: '清理建议' },
                  h('p', { className: 'dshdfw-prose' }, warning.advice),
                )
              : null,
            h('div', { className: 'dshdfw-note' },
              h('span', { 'aria-hidden': 'true' }, 'ⓘ'),
              h('span', null,
                '清理完成后，回到对话重新发送任务即可继续。此插件只做提醒，不会自动删除任何文件；请自行确认后再删除。'),
            ),
          ),
          h('div', { className: 'dshdfw-foot' },
            h('button', { type: 'button', className: 'dshdfw-btn dshdfw-btnGhost', onClick: onCopy },
              copied === 'ok' ? '路径已复制' : '复制主路径'),
            h('button', { type: 'button', className: 'dshdfw-btn dshdfw-btnPrimary', onClick: onClose },
              '我已清理，关闭提醒'),
          ),
        ),
      );
    }

    function DiskFullRow(props) {
      const phase = props && props.phase;
      const block = props && props.block;
      const callId = (props && props.callId) || '';
      const warning = phase === 'result' ? readWarningMeta(block) : null;
      const warningKey = warning ? `${warning.target}|${warning.reason}` : '';
      const seenKey = callId ? `${SEEN_PREFIX}${callId}` : '';

      const [open, setOpen] = React.useState(false);
      const [copied, setCopied] = React.useState('');

      React.useEffect(() => {
        if (!warning) return;
        if (seenKey) {
          try {
            if (window.sessionStorage.getItem(seenKey) === '1') return;
            window.sessionStorage.setItem(seenKey, '1');
          } catch (_) { /* storage disabled: still show the modal */ }
        }
        setOpen(true);
        // warningKey / seenKey are the stable identity of this warning.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [warningKey, seenKey]);

      React.useEffect(() => {
        if (!open) return;
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
        window.document.addEventListener('keydown', onKey);
        return () => window.document.removeEventListener('keydown', onKey);
      }, [open]);

      React.useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(''), 1800);
        return () => window.clearTimeout(timer);
      }, [copied]);

      const onCopy = async () => {
        const text = warning ? warning.target : '';
        if (!text) return;
        let ok = false;
        try {
          if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
            await window.navigator.clipboard.writeText(text);
            ok = true;
          }
        } catch (_) { /* fall through to the legacy path */ }
        if (!ok) {
          try {
            const area = window.document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            window.document.body.appendChild(area);
            area.select();
            ok = window.document.execCommand('copy');
            area.remove();
          } catch (_) { /* copying is best-effort */ }
        }
        setCopied(ok ? 'ok' : 'fail');
      };

      const row = h('div', { className: 'dshdfw-row' },
        h('span', { className: 'dshdfw-rowMark', 'aria-hidden': 'true' }, '!'),
        h('div', { className: 'dshdfw-rowBody' },
          h('div', { className: 'dshdfw-rowTitle' },
            warning ? '磁盘空间不足 · 本回合已停止' : '正在检查磁盘空间…'),
          h('div', { className: 'dshdfw-rowSub' },
            warning ? `建议清理：${warning.target}` : '等待工具结果'),
        ),
        warning
          ? h('button', {
              type: 'button', className: 'dshdfw-rowBtn', onClick: () => setOpen(true),
            }, '重新查看提醒')
          : null,
      );

      const modal = open && warning && typeof window.document !== 'undefined'
        ? ReactDOM.createPortal(
            h(WarningModal, { warning, onClose: () => setOpen(false), onCopy, copied }),
            window.document.body,
          )
        : null;

      return h(React.Fragment, null,
        h('style', { key: 'dshdfw-css' }, CSS),
        row,
        modal,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview',
          key: TOOL_NAME,
        }, DiskFullRow));
      },
    };
  },
});
