window.__ModuleLoader__.load({
  id: 'dsh-workspace-hud',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = 'workspaceHud';
    /** The account Remote validates a client build; mirror the shipped Desktop build. */
    const CLIENT_VERSION = '0.2.0-rc.2';
    const STORAGE_KEY = 'dsh.workspace-hud.v1';
    const FILES_REFRESH_MS = 8000;
    const ACCOUNT_REFRESH_MS = 60000;
    const USAGE_REFRESH_MS = 60000;
    const PRICING_ROUTE = '/api/workspace-hud/pricing';
    const COST_KEY = 'dsh.workspace-hud.cost.v1';
    const MAX_ROWS_PER_LEVEL = 80;
    const CARD_WIDTH = 344;
    const CARD_MIN_VISIBLE = 48;

    const zh = {
      'title': 'DSH-资源统计弹窗',
      'dragHint': '拖动可移动，双击复位',
      'refresh': '刷新',
      'collapse': '折叠',
      'expand': '展开',
      'hide': '隐藏',
      'show': '概览',
      'noSession': '未选择会话',
      'files.title': '工作区文件',
      'files.count': '{count} 项',
      'files.loading': '正在读取工作区…',
      'files.empty': '工作区里还没有文件',
      'files.failed': '暂时读不到工作区文件',
      'files.retry': '重试',
      'files.more': '还有 {count} 项未显示',
      'files.truncated': '目录太大，只显示了一部分',
      'balance.title': '账户余额',
      'balance.loading': '读取中…',
      'balance.signedOut': '未登录',
      'balance.failed': '余额暂时不可用',
      'balance.bonus': '赠送 {amount}',
      'balance.updated': '更新于 {time}',
      'tokens.title': 'Token 消耗',
      'tokens.account': '账户',
      'tokens.workspace': '工作区',
      'tokens.input': '输入',
      'tokens.output': '输出',
      'tokens.cacheRead': '缓存读取',
      'tokens.cacheWrite': '缓存写入',
      'tokens.empty': '还没有 Token 消耗记录',
      'tokens.loading': '统计中…',
      'tokens.total': '合计',
      'tokens.foot': '当前工作区 {workspace} 个会话 · 账户 {account} 个会话',
      'cost.title': '工作区花费',
      'cost.loading': '读取价格…',
      'cost.unavailable': '价格不可用',
      'cost.demo': '示例价',
      'cost.official': '官方价',
      'cost.checked': '校准 {time}',
      'cost.never': '未校准',
      'cost.stale': '价格可能过期',
      'cost.calibrationFailed': '校准失败，沿用本地价格',
      'cost.unpriced': '{tokens} tokens 未计价',
    };

    const en = {
      'title': 'DSH resource stats',
      'dragHint': 'Drag to move, double-click to reset',
      'refresh': 'Refresh',
      'collapse': 'Collapse',
      'expand': 'Expand',
      'hide': 'Hide',
      'show': 'Overview',
      'noSession': 'No session selected',
      'files.title': 'Workspace files',
      'files.count': '{count} items',
      'files.loading': 'Reading the workspace…',
      'files.empty': 'This workspace has no files yet',
      'files.failed': 'Could not read the workspace files',
      'files.retry': 'Retry',
      'files.more': '{count} more not shown',
      'files.truncated': 'Directory is large; only part is shown',
      'balance.title': 'Account balance',
      'balance.loading': 'Loading…',
      'balance.signedOut': 'Not signed in',
      'balance.failed': 'Balance is unavailable',
      'balance.bonus': 'Bonus {amount}',
      'balance.updated': 'Updated {time}',
      'tokens.title': 'Token usage',
      'tokens.account': 'Account',
      'tokens.workspace': 'Workspace',
      'tokens.input': 'Input',
      'tokens.output': 'Output',
      'tokens.cacheRead': 'Cache read',
      'tokens.cacheWrite': 'Cache write',
      'tokens.empty': 'No token usage recorded yet',
      'tokens.loading': 'Counting…',
      'tokens.total': 'Total',
      'tokens.foot': 'Workspace {workspace} sessions · Account {account} sessions',
      'cost.title': 'Workspace cost',
      'cost.loading': 'Reading prices…',
      'cost.unavailable': 'Prices unavailable',
      'cost.demo': 'sample rates',
      'cost.official': 'official rates',
      'cost.checked': 'checked {time}',
      'cost.never': 'not calibrated',
      'cost.stale': 'prices may be stale',
      'cost.calibrationFailed': 'calibration failed, using local prices',
      'cost.unpriced': '{tokens} tokens unpriced',
    };

    const CSS = `
      .wshud-card {
        position: fixed;
        top: calc(var(--dsh-windows-titlebar-height, 0px) + 14px);
        right: 18px;
        z-index: 30;
        display: flex;
        flex-direction: column;
        width: ${CARD_WIDTH}px;
        max-width: calc(100vw - 36px);
        max-height: calc(100vh - var(--dsh-windows-titlebar-height, 0px) - 40px);
        overflow: hidden;
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-1);
        border: 0.5px solid var(--dsw-alias-border-l3);
        border-radius: var(--dsw-radius-lg);
        box-shadow: var(--dsw-elevation-panel);
        font: var(--dsw-font-xs-13);
        -webkit-app-region: no-drag;
        animation: wshud-in 160ms var(--ds-ease-in-out);
      }
      @keyframes wshud-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .wshud-card { animation: none; }
      }
      .wshud-head {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
        padding: 8px 8px 8px 12px;
        border-bottom: 0.5px solid var(--dsw-alias-border-l2);
        cursor: grab;
        touch-action: none;
        user-select: none;
      }
      .wshud-card[data-dragging] .wshud-head {
        cursor: grabbing;
      }
      .wshud-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font: var(--dsw-font-xs-strong-13);
        color: var(--dsw-alias-label-primary);
      }
      .wshud-iconbtn {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: var(--dsw-radius-sm);
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        cursor: pointer;
      }
      .wshud-iconbtn:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .wshud-iconbtn:focus-visible {
        outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
        outline-offset: 1px;
      }
      .wshud-body {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: auto;
      }
      .wshud-sec {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 9px 12px 10px;
      }
      .wshud-sec + .wshud-sec {
        border-top: 0.5px solid var(--dsw-alias-border-l1);
      }
      .wshud-sechead {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        color: var(--dsw-alias-label-secondary);
        font: var(--dsw-font-xxs-strong-12);
      }
      .wshud-sechead span:last-child {
        flex: none;
        max-width: 60%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-tertiary);
        font: var(--dsw-font-xxxs-11);
        font-variant-numeric: tabular-nums;
      }
      .wshud-path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-tertiary);
        font: var(--dsw-font-xxxs-11);
      }
      .wshud-list {
        display: flex;
        flex-direction: column;
        max-height: 190px;
        overflow: auto;
        margin: 0 -4px;
      }
      .wshud-row {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        min-height: 22px;
        padding: 1px 4px;
        border: none;
        border-radius: var(--dsw-radius-sm);
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        text-align: left;
        font: var(--dsw-font-xxs-12);
        cursor: pointer;
      }
      .wshud-row:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .wshud-row:focus-visible {
        outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
        outline-offset: -1px;
      }
      .wshud-row svg {
        flex: none;
        color: var(--dsw-alias-label-tertiary);
      }
      .wshud-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .wshud-meta {
        flex: none;
        color: var(--dsw-alias-label-tertiary);
        font-variant-numeric: tabular-nums;
      }
      .wshud-note {
        padding: 2px 4px;
        color: var(--dsw-alias-label-tertiary);
        font: var(--dsw-font-xxxs-11);
      }
      .wshud-error {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 2px 0;
        color: var(--dsw-alias-state-error-primary);
        font: var(--dsw-font-xxs-12);
      }
      .wshud-linkbtn {
        flex: none;
        padding: 1px 6px;
        border: 0.5px solid var(--dsw-alias-border-l3);
        border-radius: var(--dsw-radius-sm);
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        font: var(--dsw-font-xxxs-11);
        cursor: pointer;
      }
      .wshud-linkbtn:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .wshud-amount {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font: var(--dsw-font-l-20);
        font-variant-numeric: tabular-nums;
        color: var(--dsw-alias-label-primary);
      }
      .wshud-amount small {
        color: var(--dsw-alias-label-tertiary);
        font: var(--dsw-font-xxs-12);
      }
      .wshud-sub {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-tertiary);
        font: var(--dsw-font-xxxs-11);
      }
      .wshud-usage {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 12px;
        row-gap: 2px;
        align-items: baseline;
        margin-top: 2px;
        font-variant-numeric: tabular-nums;
      }
      .wshud-usage-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-tertiary);
        font: var(--dsw-font-xxxs-11);
      }
      .wshud-usage-col {
        text-align: right;
        color: var(--dsw-alias-label-secondary);
        font: var(--dsw-font-xxxs-strong-11);
      }
      .wshud-usage-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: right;
        color: var(--dsw-alias-label-secondary);
        font: var(--dsw-font-xxxs-strong-11);
      }
      .wshud-usage .wshud-usage-total {
        color: var(--dsw-alias-label-primary);
        font: var(--dsw-font-xs-strong-13);
      }
      .wshud-cost {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 0.5px solid var(--dsw-alias-border-l1);
      }
      .wshud-cost span {
        color: var(--dsw-alias-label-tertiary);
        font: var(--dsw-font-xxxs-11);
      }
      .wshud-cost b {
        color: var(--dsw-alias-label-primary);
        font: var(--dsw-font-xs-strong-13);
        font-variant-numeric: tabular-nums;
      }
      .wshud-pill {
        position: fixed;
        top: calc(var(--dsh-windows-titlebar-height, 0px) + 14px);
        right: 18px;
        z-index: 30;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 12px;
        border: 0.5px solid var(--dsw-alias-border-l3);
        border-radius: 999px;
        background: var(--dsw-alias-button-floating-fill);
        color: var(--dsw-alias-label-secondary);
        box-shadow: var(--dsw-elevation-panel);
        font: var(--dsw-font-xxs-12);
        cursor: pointer;
        -webkit-app-region: no-drag;
      }
      .wshud-pill:hover {
        background: var(--dsw-alias-button-floating-hover);
        color: var(--dsw-alias-label-primary);
      }
      .wshud-pill svg {
        color: var(--dsw-alias-label-tertiary);
      }
    `;

    const isWindows = typeof navigator !== 'undefined' && /^win/i.test(navigator.platform || '');
    const numberFormat = new Intl.NumberFormat('en-US');

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    function normalizedPosition(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: null, y: null };
      return {
        x: clamp(x, 8, window.innerWidth - CARD_WIDTH - 8),
        y: clamp(y, 8, window.innerHeight - CARD_MIN_VISIBLE),
      };
    }

    function normPath(path) {
      const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
      return isWindows ? normalized.toLowerCase() : normalized;
    }

    function joinPath(base, name) {
      return base ? `${base}/${name}` : name;
    }

    function tokenCount(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : 0;
    }

    function formatTokens(value) {
      return numberFormat.format(Math.round(tokenCount(value)));
    }

    function formatBytes(bytes) {
      const number = Number(bytes);
      if (!Number.isFinite(number) || number < 0) return '';
      if (number < 1024) return `${number} B`;
      if (number < 1024 * 1024) return `${(number / 1024).toFixed(number < 10240 ? 1 : 0)} KB`;
      return `${(number / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatMoney(amount, currency) {
      const symbol = currency === 'CNY' ? '¥' : '$';
      const number = Number(amount);
      if (!Number.isFinite(number)) return `${symbol}${String(amount ?? '')}`;
      return symbol + number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatCost(amount, currency) {
      const number = Number(amount);
      if (!Number.isFinite(number)) return '—';
      const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency || ''} `;
      return `${symbol}${number.toFixed(number > 0 && number < 1 ? 4 : 2)}`;
    }

    function formatPricingTime(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    /** Cost of one token increment, in the price table's currency. Mirrors the host. */
    function costOfTokens(tokens, rates, multiplier) {
      if (!rates) return 0;
      const units = (
        tokenCount(tokens.input) * rates.input +
        tokenCount(tokens.output) * rates.output +
        tokenCount(tokens.cacheRead) * rates.cacheRead +
        tokenCount(tokens.cacheWrite) * rates.cacheWrite
      ) / 1000000;
      return units * (multiplier || 1);
    }

    /** The multiplier in effect at `date`; window times are wall-clock in the table's offset. */
    function discountMultiplier(pricing, date) {
      const offset = pricing?.utcOffsetMinutes ?? 0;
      const shifted = new Date(date.getTime() + offset * 60000);
      const key = shifted.toISOString().slice(0, 10);
      if (pricing?.holidays?.includes(key)) return 1;

      const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
      const weekday = shifted.getUTCDay();
      let multiplier = 1;
      for (const window of pricing?.windows ?? []) {
        if (window.days && !window.days.includes(weekday)) continue;
        const active = window.overnight
          ? minutes >= window.from || minutes < window.to
          : minutes >= window.from && minutes < window.to;
        if (active) multiplier = window.multiplier;
      }
      return multiplier;
    }

    function readCostLedger() {
      const empty = { version: 1, workspaces: {} };
      try {
        const raw = window.localStorage.getItem(COST_KEY);
        if (!raw) return empty;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.workspaces || typeof parsed.workspaces !== 'object') {
          return empty;
        }
        return parsed;
      } catch {
        return empty;
      }
    }

    function writeCostLedger(ledger) {
      try {
        window.localStorage.setItem(COST_KEY, JSON.stringify(ledger));
      } catch {
        /* a storage failure must not break the card */
      }
    }

    function formatClock(time) {
      if (!time) return '';
      try {
        return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    }

    function compareEntries(left, right) {
      const leftDir = left.type === 'directory' ? 0 : 1;
      const rightDir = right.type === 'directory' ? 0 : 1;
      if (leftDir !== rightDir) return leftDir - rightDir;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    }

    function readStoredUi() {
      const fallback = { open: true, hidden: false, x: null, y: null };
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        const position = normalizedPosition(parsed.x, parsed.y);
        return {
          open: parsed.open !== false,
          hidden: parsed.hidden === true,
          x: position.x,
          y: position.y,
        };
      } catch {
        return fallback;
      }
    }

    function icon(path, size) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size || 14,
        height: size || 14,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
      }, h('path', { d: path }));
    }

    const ICONS = {
      logo: 'M2.5 3.5h11v9h-11zM2.5 6.5h11M6 6.5v6',
      refresh: 'M13 6.5A5 5 0 0 0 4.2 4.6L3 6M3 9.5a5 5 0 0 0 8.8 1.9L13 10M3 3.5V6h2.5M13 12.5V10h-2.5',
      chevronDown: 'M4 6l4 4 4-4',
      chevronRight: 'M6 4l4 4-4 4',
      folder: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.2l1.3 1.5h5.5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z',
      file: 'M4 2.5h5l3 3v8H4zM9 2.5V5.5h3',
      close: 'M4 4l8 8M12 4l-8 8',
      expand: 'M4 6l4 4 4-4',
      collapse: 'M6 4l4 4-4 4',
    };

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workspace-hud: dictionaries');

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-workspace-hud';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => tag.remove();
      }, 'workspace-hud: styles');

      const subscribeList = (onChange) => ctx.sessions.list.subscribe(onChange);
      const getListSnapshot = () => ctx.sessions.list.getSnapshot();

      function WorkspaceHud(props) {
        const { t } = props;

        const list = useSyncExternalStore(subscribeList, getListSnapshot, getListSnapshot);

        const rows = useMemo(() => {
          const ids = Array.isArray(list.ids) ? list.ids : Object.keys(list.byId || {});
          return ids.map((id) => list.byId[id]).filter(Boolean);
        }, [list]);

        const current = useMemo(
          () => rows.find((row) => (row.retainedBy?.mainView ?? 0) > 0) || null,
          [rows],
        );

        const [ui, setUi] = useState(readStoredUi);
        const [dragging, setDragging] = useState(false);
        const dragRef = useRef(null);
        const cardRef = useRef(null);

        useEffect(() => {
          if (dragging) return;
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ui));
          } catch {
            /* a storage failure must not break the card */
          }
        }, [ui, dragging]);

        useEffect(() => {
          const onResize = () => {
            setUi((previous) => {
              if (previous.x === null) return previous;
              const next = normalizedPosition(previous.x, previous.y);
              return next.x === previous.x && next.y === previous.y ? previous : { ...previous, ...next };
            });
          };
          window.addEventListener('resize', onResize);
          return () => window.removeEventListener('resize', onResize);
        }, []);

        const [refreshTick, setRefreshTick] = useState(0);

        /* ---------------------------------------------------------------- drag */

        const beginDrag = useCallback((event) => {
          if (event.button !== 0 && event.pointerType === 'mouse') return;
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('button')) return;
          const element = cardRef.current;
          if (!element) return;
          const rect = element.getBoundingClientRect();
          dragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            width: rect.width,
            height: rect.height,
          };
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            /* a synthetic pointer may not be capturable */
          }
          setDragging(true);
          event.preventDefault();
        }, []);

        const moveDrag = useCallback((event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const x = clamp(event.clientX - drag.offsetX, 8, window.innerWidth - drag.width - 8);
          const y = clamp(event.clientY - drag.offsetY, 8, window.innerHeight - drag.height - 8);
          setUi((previous) => {
            if (previous.x === x && previous.y === y) return previous;
            return { ...previous, x, y };
          });
        }, []);

        const endDrag = useCallback((event) => {
          const drag = dragRef.current;
          if (!drag) return;
          dragRef.current = null;
          setDragging(false);
          try {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          } catch {
            /* capture may already be gone */
          }
        }, []);

        const resetPosition = useCallback(() => {
          setUi((previous) => ({ ...previous, x: null, y: null }));
        }, []);

        /* ---------------------------------------------------------------- files */

        const [tree, setTree] = useState({
          sessionId: null,
          status: 'idle',
          entries: [],
          truncated: false,
          levels: {},
          expanded: [],
          updatedAt: 0,
        });
        const generationRef = useRef(0);
        const sessionRef = useRef(null);

        const loadLevel = useCallback(async (relative, signal, generation) => {
          const sessionId = sessionRef.current;
          if (!sessionId) return;
          const path = relative === '' ? '.' : relative;

          let result;
          try {
            result = await ctx.remote.workspaceFiles.list(sessionId, path, signal);
          } catch (error) {
            result = null;
          }
          if (signal?.aborted || generation !== generationRef.current) return;

          const entries = result && result.ok
            ? (Array.isArray(result.value?.entries) ? result.value.entries : [])
              .filter((entry) => entry && typeof entry.name === 'string')
              .slice()
              .sort(compareEntries)
            : null;

          if (relative === '') {
            setTree((previous) => (entries === null
              ? { ...previous, status: 'error', entries: [], truncated: false }
              : {
                ...previous,
                status: 'ready',
                entries,
                truncated: result.value?.truncated === true,
                updatedAt: Date.now(),
              }));
            return;
          }

          setTree((previous) => ({
            ...previous,
            levels: {
              ...previous.levels,
              [relative]: entries === null
                ? { status: 'error', entries: [], truncated: false }
                : { status: 'ready', entries, truncated: result.value?.truncated === true },
            },
          }));
        }, []);

        useEffect(() => {
          const sessionId = current?.id ?? null;
          const previousSession = sessionRef.current;
          sessionRef.current = sessionId;
          generationRef.current += 1;
          const generation = generationRef.current;

          if (sessionId !== previousSession) {
            setTree({
              sessionId,
              status: sessionId ? 'loading' : 'idle',
              entries: [],
              truncated: false,
              levels: {},
              expanded: [],
              updatedAt: 0,
            });
          }
          if (!sessionId) return;

          const controller = new AbortController();
          loadLevel('', controller.signal, generation);

          const timer = window.setInterval(() => {
            if (document.hidden) return;
            if (generation !== generationRef.current) return;
            loadLevel('', controller.signal, generation);
          }, FILES_REFRESH_MS);

          return () => {
            controller.abort();
            window.clearInterval(timer);
          };
        }, [current?.id, current?.cwd, refreshTick, loadLevel]);

        const toggleDirectory = useCallback((relative) => {
          const generation = generationRef.current;
          const alreadyLoaded = tree.levels[relative] !== undefined;
          setTree((previous) => (previous.expanded.includes(relative)
            ? { ...previous, expanded: previous.expanded.filter((value) => value !== relative) }
            : { ...previous, expanded: [...previous.expanded, relative] }));
          if (!alreadyLoaded) loadLevel(relative, undefined, generation);
        }, [tree.levels, loadLevel]);

        const openFile = useCallback((relative) => {
          const sessionId = sessionRef.current;
          if (!sessionId) return;
          try {
            const encoded = String(relative).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
            const address = `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`;
            ctx.sidebarRight.openResource(address);
          } catch (error) {
            ctx.logger?.warn?.('workspace-hud: could not open file', error);
          }
        }, []);

        /* -------------------------------------------------------------- account */

        const [account, setAccount] = useState({ loading: true, error: false, signedOut: false, data: null });
        const accountGeneration = useRef(0);

        useEffect(() => {
          let alive = true;
          const generation = ++accountGeneration.current;

          const run = async () => {
            setAccount((previous) => ({ ...previous, loading: previous.data === null }));
            const metadata = {
              version: CLIENT_VERSION,
              locale: ctx.locale.getSnapshot().active || 'en',
              timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
            };
            try {
              const [balance, profile] = await Promise.all([
                ctx.remote.account.getBalance(metadata),
                ctx.remote.account.getProfile(metadata),
              ]);
              if (!alive || generation !== accountGeneration.current) return;

              if (balance && balance.ok && balance.value && balance.value.status === 'ready') {
                setAccount({
                  loading: false,
                  error: false,
                  signedOut: false,
                  data: {
                    wallets: Array.isArray(balance.value.value) ? balance.value.value : [],
                    bonusWallets: Array.isArray(balance.value.bonusWallets) ? balance.value.bonusWallets : [],
                    profile: profile && profile.ok && profile.value && profile.value.status === 'ready'
                      ? profile.value.value
                      : null,
                    at: Date.now(),
                  },
                });
              } else {
                setAccount({
                  loading: false,
                  error: !(balance && balance.ok && balance.value === null),
                  signedOut: Boolean(balance && balance.ok && balance.value === null),
                  data: null,
                });
              }
            } catch (error) {
              if (!alive || generation !== accountGeneration.current) return;
              setAccount((previous) => ({ ...previous, loading: false, error: true }));
            }
          };

          run();
          const timer = window.setInterval(() => {
            if (!document.hidden) run();
          }, ACCOUNT_REFRESH_MS);
          const onFocus = () => run();
          window.addEventListener('focus', onFocus);

          return () => {
            alive = false;
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
          };
        }, [refreshTick]);

        /* --------------------------------------------------------------- tokens */

        /*
         * One `session.list` read carries every Session's projection block, so the
         * account total needs no per-session projection loads. Live sessions are
         * overlaid with their store values, which update while a turn streams.
         */
        const [usage, setUsage] = useState({ status: 'loading', items: [] });
        const usageGeneration = useRef(0);

        useEffect(() => {
          if (!ui.open || ui.hidden) return;
          let alive = true;
          const generation = ++usageGeneration.current;

          const run = async () => {
            let result;
            try {
              result = await ctx.remote.session.list({});
            } catch (error) {
              result = null;
            }
            if (!alive || generation !== usageGeneration.current) return;
            if (result && result.ok && Array.isArray(result.value?.items)) {
              setUsage({ status: 'ready', items: result.value.items });
            } else {
              setUsage((previous) => ({ status: previous.items.length > 0 ? 'ready' : 'error', items: previous.items }));
            }
          };

          run();
          const timer = window.setInterval(() => {
            if (!document.hidden) run();
          }, USAGE_REFRESH_MS);

          return () => {
            alive = false;
            window.clearInterval(timer);
          };
        }, [refreshTick, ui.open, ui.hidden]);

        const usageSessions = useMemo(() => {
          const byId = new Map();
          for (const item of usage.items) {
            if (!item || typeof item.sessionId !== 'string' || item.blank === true) continue;
            byId.set(item.sessionId, {
              id: item.sessionId,
              cwd: item.cwd,
              totals: item.projections?.values?.tokenUsage,
              model: item.projections?.values?.modelSelection?.lastUsed?.model,
            });
          }
          for (const row of rows) {
            if (row.blank === true) continue;
            const live = row.projectionValues?.tokenUsage;
            const previous = byId.get(row.id);
            if (live === undefined && previous !== undefined && previous.cwd !== undefined) continue;
            byId.set(row.id, {
              id: row.id,
              cwd: row.cwd ?? previous?.cwd,
              totals: live ?? previous?.totals,
              model: row.projectionValues?.modelSelection?.lastUsed?.model ?? previous?.model,
            });
          }
          return [...byId.values()];
        }, [usage.items, rows]);

        const workspaceKey = normPath(current?.cwd);

        const workspaceUsage = useMemo(() => {
          const members = current && workspaceKey
            ? usageSessions.filter((session) => session.cwd && normPath(session.cwd) === workspaceKey)
            : [];
          return summarizeUsage(members);
        }, [usageSessions, workspaceKey, current]);

        const accountUsage = useMemo(() => summarizeUsage(usageSessions), [usageSessions]);

        /* ------------------------------------------------------------- pricing */

        /**
         * Every incremental cost pass fetches the price table *first*, then the
         * session snapshot, so the delta is priced with the rates and the
         * time coefficient in effect at that moment. The host reads its local
         * `pricing.json` on every request and calibrates the official page once a
         * week.
         */
        const [pricing, setPricing] = useState({ status: 'loading', data: null, meta: null, error: null });
        const pricingRef = useRef(null);
        const pricingMetaRef = useRef({});
        const rowsRef = useRef(rows);
        rowsRef.current = rows;
        const [cost, setCost] = useState(null);

        useEffect(() => {
          if (!ui.open || ui.hidden) return undefined;
          if (!workspaceKey) {
            setCost(null);
            return undefined;
          }
          let alive = true;

          const tick = async () => {
            let data = null;
            let pricingError = null;
            try {
              const response = await fetch(PRICING_ROUTE, { cache: 'no-store' });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const body = await response.json();
              if (!body || body.ok === false || !body.pricing) throw new Error(body?.error || 'pricing unavailable');
              data = body.pricing;
              pricingRef.current = data;
              pricingMetaRef.current = body.meta ?? {};
              if (alive) setPricing({ status: 'ready', data, meta: body.meta ?? {}, error: null });
            } catch (error) {
              pricingError = String(error?.message ?? error);
              data = pricingRef.current;
              if (alive) {
                setPricing(data
                  ? { status: 'stale', data, meta: pricingMetaRef.current, error: pricingError }
                  : { status: 'error', data: null, meta: null, error: pricingError });
              }
            }
            if (!data || !alive) return;

            let result;
            try {
              result = await ctx.remote.session.list({});
            } catch {
              return;
            }
            if (!alive) return;
            if (!result || !result.ok || !Array.isArray(result.value?.items)) return;

            const byId = new Map();
            for (const item of result.value.items) {
              if (!item || typeof item.sessionId !== 'string' || item.blank === true) continue;
              byId.set(item.sessionId, {
                id: item.sessionId,
                cwd: item.cwd,
                totals: item.projections?.values?.tokenUsage,
                model: item.projections?.values?.modelSelection?.lastUsed?.model,
              });
            }
            for (const row of rowsRef.current) {
              if (row.blank === true) continue;
              const live = row.projectionValues?.tokenUsage;
              const previous = byId.get(row.id);
              if (live === undefined && previous !== undefined && previous.cwd !== undefined) continue;
              byId.set(row.id, {
                id: row.id,
                cwd: row.cwd ?? previous?.cwd,
                totals: live ?? previous?.totals,
                model: row.projectionValues?.modelSelection?.lastUsed?.model ?? previous?.model,
              });
            }

            const now = Date.now();
            const multiplier = discountMultiplier(data, new Date(now));
            const ledger = readCostLedger();
            // A currency change means the table changed identity (demo CNY -> official USD);
            // start a fresh ledger so amounts from two currencies are never added.
            let entry = ledger.workspaces[workspaceKey];
            if (entry && entry.currency !== data.currency) entry = undefined;
            const previousSessions = entry?.sessions ?? {};
            let total = Number.isFinite(Number(entry?.cost)) ? Number(entry.cost) : 0;
            let unpriced = 0;
            const sessions = {};

            for (const session of byId.values()) {
              if (!session.cwd || normPath(session.cwd) !== workspaceKey) continue;
              const totals = session.totals;
              if (!totals || typeof totals !== 'object') continue;
              const buckets = {
                input: tokenCount(totals.uncachedInputTokens),
                output: tokenCount(totals.outputTokens),
                cacheRead: tokenCount(totals.cacheReadTokens),
                cacheWrite: tokenCount(totals.cacheWriteTokens),
              };
              const previous = previousSessions[session.id] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
              const delta = {
                input: Math.max(0, buckets.input - previous.input),
                output: Math.max(0, buckets.output - previous.output),
                cacheRead: Math.max(0, buckets.cacheRead - previous.cacheRead),
                cacheWrite: Math.max(0, buckets.cacheWrite - previous.cacheWrite),
              };
              const model = session.model || data.defaultModel;
              const rates = data.models?.[model] ?? (data.defaultModel ? data.models?.[data.defaultModel] : undefined);
              const deltaTotal = delta.input + delta.output + delta.cacheRead + delta.cacheWrite;
              if (rates) {
                total += costOfTokens(delta, rates, multiplier);
              } else if (deltaTotal > 0) {
                unpriced += deltaTotal;
              }
              sessions[session.id] = buckets;
            }

            const next = {
              currency: data.currency,
              cost: total,
              checkedAt: data.checkedAt ?? null,
              demo: data.demo === true,
              seededAt: entry?.seededAt ?? now,
              updatedAt: now,
              sessions,
            };
            ledger.workspaces[workspaceKey] = next;
            writeCostLedger(ledger);
            if (!alive) return;
            setCost({
              status: 'ready',
              currency: next.currency,
              cost: next.cost,
              checkedAt: next.checkedAt,
              demo: next.demo,
              unpriced,
              meta: pricingMetaRef.current,
              error: pricingError,
            });
          };

          tick();
          const timer = window.setInterval(() => {
            if (!document.hidden) tick();
          }, USAGE_REFRESH_MS);
          return () => {
            alive = false;
            window.clearInterval(timer);
          };
        }, [refreshTick, ui.open, ui.hidden, workspaceKey]);

        /* --------------------------------------------------------------- render */

        const refresh = () => setRefreshTick((value) => value + 1);

        const header = h('header', {
          className: 'wshud-head',
          title: t('dragHint'),
          onPointerDown: beginDrag,
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onDoubleClick: (event) => {
            const target = event.target;
            if (target && typeof target.closest === 'function' && target.closest('button')) return;
            resetPosition();
          },
        },
        h('span', { style: { display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)' } }, icon(ICONS.logo, 16)),
        h('span', { className: 'wshud-title' }, t('title')),
        h('button', {
          type: 'button', className: 'wshud-iconbtn', title: t('refresh'), 'aria-label': t('refresh'),
          onClick: refresh,
        }, icon(ICONS.refresh)),
        h('button', {
          type: 'button', className: 'wshud-iconbtn',
          title: ui.open ? t('collapse') : t('expand'),
          'aria-label': ui.open ? t('collapse') : t('expand'),
          'aria-expanded': ui.open,
          onClick: () => setUi((value) => ({ ...value, open: !value.open })),
        }, icon(ui.open ? ICONS.expand : ICONS.collapse)),
        h('button', {
          type: 'button', className: 'wshud-iconbtn', title: t('hide'), 'aria-label': t('hide'),
          onClick: () => setUi((value) => ({ ...value, hidden: true, open: true })),
        }, icon(ICONS.close)),
        );

        function renderLevel(relative, depth, level) {
          if (!level || level.status === 'loading') {
            return h('div', { key: `${relative || '.'}:loading`, className: 'wshud-note' }, t('files.loading'));
          }
          if (level.status === 'error') {
            return h('div', { key: `${relative || '.'}:error`, className: 'wshud-error' },
              h('span', null, t('files.failed')),
              h('button', { type: 'button', className: 'wshud-linkbtn', onClick: refresh }, t('files.retry')));
          }
          if (level.entries.length === 0) {
            return h('div', { key: `${relative || '.'}:empty`, className: 'wshud-note' },
              relative === '' ? t('files.empty') : '—');
          }

          const children = [];
          const visible = level.entries.slice(0, MAX_ROWS_PER_LEVEL);
          for (const entry of visible) {
            const path = joinPath(relative, entry.name);
            const indent = { paddingLeft: `${4 + depth * 12}px` };

            if (entry.type === 'directory') {
              const expanded = tree.expanded.includes(path);
              children.push(h('button', {
                key: path,
                type: 'button',
                className: 'wshud-row',
                style: indent,
                title: path,
                'aria-expanded': expanded,
                onClick: () => toggleDirectory(path),
              },
              h('span', { style: { display: 'inline-flex', width: 12 } },
                icon(expanded ? ICONS.chevronDown : ICONS.chevronRight, 12)),
              h('span', { style: { display: 'inline-flex', width: 14 } }, icon(ICONS.folder, 13)),
              h('span', { className: 'wshud-name' }, entry.name)));
              if (expanded) children.push(renderLevel(path, depth + 1, tree.levels[path]));
              continue;
            }

            if (entry.type === 'file') {
              children.push(h('button', {
                key: path,
                type: 'button',
                className: 'wshud-row',
                style: indent,
                title: path,
                onClick: () => openFile(path),
              },
              h('span', { style: { display: 'inline-flex', width: 12 } }),
              h('span', { style: { display: 'inline-flex', width: 14 } }, icon(ICONS.file, 13)),
              h('span', { className: 'wshud-name' }, entry.name),
              entry.size !== undefined ? h('span', { className: 'wshud-meta' }, formatBytes(entry.size)) : null));
              continue;
            }

            children.push(h('div', { key: path, className: 'wshud-row', style: { ...indent, cursor: 'default' } },
              h('span', { style: { display: 'inline-flex', width: 12 } }),
              h('span', { className: 'wshud-name' }, entry.name)));
          }
          if (level.entries.length > visible.length) {
            children.push(h('div', { key: `${relative || '.'}:more`, className: 'wshud-note' },
              t('files.more', { count: level.entries.length - visible.length })));
          }
          if (level.truncated) {
            children.push(h('div', { key: `${relative || '.'}:truncated`, className: 'wshud-note' }, t('files.truncated')));
          }
          return h(React.Fragment, { key: `${relative || '.'}:level` }, children);
        }

        const rootLevel = {
          status: tree.status === 'idle' && current ? 'loading' : tree.status,
          entries: tree.entries,
          truncated: tree.truncated,
        };

        const filesSection = h('section', { className: 'wshud-sec', 'aria-label': t('files.title') },
          h('div', { className: 'wshud-sechead' },
            h('span', null, t('files.title')),
            h('span', null, current && tree.status === 'ready'
              ? t('files.count', { count: tree.entries.length })
              : '')),
          h('div', { className: 'wshud-path', title: current?.cwd || '' }, current?.cwd || t('noSession')),
          current
            ? h('div', { className: 'wshud-list' }, renderLevel('', 0, rootLevel))
            : h('div', { className: 'wshud-note' }, t('noSession')));

        const wallets = account.data?.wallets ?? [];
        const bonusWallets = (account.data?.bonusWallets ?? []).filter((wallet) => Number(wallet.balance) > 0);
        const accountName = account.data?.profile?.name || account.data?.profile?.contact || '';
        const balanceValue = wallets.length > 0
          ? wallets.map((wallet) => formatMoney(wallet.balance, wallet.currency)).join(' + ')
          : formatMoney(0, 'CNY');

        const balanceSection = h('section', { className: 'wshud-sec', 'aria-label': t('balance.title') },
          h('div', { className: 'wshud-sechead' },
            h('span', null, t('balance.title')),
            h('span', { title: accountName }, accountName)),
          account.data
            ? h('div', null,
              h('div', { className: 'wshud-amount' },
                balanceValue,
                bonusWallets.length > 0
                  ? h('small', null, t('balance.bonus', {
                    amount: bonusWallets.map((wallet) => formatMoney(wallet.balance, wallet.currency)).join(' + '),
                  }))
                  : null))
            : h('div', { className: 'wshud-amount' },
              h('small', null, account.loading
                ? t('balance.loading')
                : account.signedOut ? t('balance.signedOut') : t('balance.failed'))),
          account.data
            ? h('div', { className: 'wshud-sub' }, t('balance.updated', { time: formatClock(account.data.at) }))
            : null);

        const usageCells = [
          h('span', { key: 'usage-h0', className: 'wshud-usage-label' }),
          h('span', { key: 'usage-h1', className: 'wshud-usage-col' }, t('tokens.account')),
          h('span', { key: 'usage-h2', className: 'wshud-usage-col' }, t('tokens.workspace')),
          h('span', { key: 'usage-t0', className: 'wshud-usage-label' }, t('tokens.total')),
          h('b', { key: 'usage-t1', className: 'wshud-usage-value wshud-usage-total' }, formatTokens(accountUsage.total)),
          h('b', { key: 'usage-t2', className: 'wshud-usage-value wshud-usage-total' }, formatTokens(workspaceUsage.total)),
        ];
        for (const [labelKey, field] of [
          ['tokens.input', 'input'],
          ['tokens.output', 'output'],
          ['tokens.cacheRead', 'cacheRead'],
          ['tokens.cacheWrite', 'cacheWrite'],
        ]) {
          usageCells.push(h('span', { key: `usage-${field}-l`, className: 'wshud-usage-label' }, t(labelKey)));
          usageCells.push(h('b', { key: `usage-${field}-a`, className: 'wshud-usage-value' }, formatTokens(accountUsage[field])));
          usageCells.push(h('b', { key: `usage-${field}-w`, className: 'wshud-usage-value' }, formatTokens(workspaceUsage[field])));
        }

        const costNotes = [];
        let costValue = t('cost.loading');
        if (cost) {
          if (cost.status === 'ready' || cost.status === 'cached') {
            costValue = `≈ ${formatCost(cost.cost, cost.currency)}`;
            if (cost.status === 'cached') costNotes.push(t('cost.unavailable'));
            costNotes.push(cost.demo ? t('cost.demo') : t('cost.official'));
            if (cost.checkedAt) costNotes.push(t('cost.checked', { time: formatPricingTime(cost.checkedAt) }));
            else costNotes.push(t('cost.never'));
            if (cost.status === 'ready') {
              if (cost.meta?.error) costNotes.push(t('cost.calibrationFailed'));
              else if (cost.error || cost.meta?.stale) costNotes.push(t('cost.stale'));
              if (cost.unpriced > 0) costNotes.push(t('cost.unpriced', { tokens: formatTokens(cost.unpriced) }));
            }
          } else if (cost.status === 'error') {
            costValue = t('cost.unavailable');
          }
        } else if (pricing.status === 'error') {
          costValue = t('cost.unavailable');
        }

        const costLine = h('div', { className: 'wshud-cost' },
          h('span', null, t('cost.title')),
          h('b', null, costValue));

        const tokensSection = h('section', { className: 'wshud-sec', 'aria-label': t('tokens.title') },
          h('div', { className: 'wshud-sechead' },
            h('span', null, t('tokens.title')),
            h('span', null, usage.status === 'loading' ? t('tokens.loading') : '')),
          accountUsage.total + workspaceUsage.total > 0
            ? h('div', { className: 'wshud-usage' }, ...usageCells)
            : h('div', { className: 'wshud-note' }, t('tokens.empty')),
          costLine,
          costNotes.length > 0 ? h('div', { className: 'wshud-sub' }, costNotes.join(' · ')) : null,
          h('div', { className: 'wshud-sub' },
            t('tokens.foot', {
              workspace: workspaceUsage.sessions,
              account: accountUsage.sessions,
            })));

        if (ui.hidden) {
          const pillStyle = ui.x === null
            ? undefined
            : { left: clamp(ui.x, 8, window.innerWidth - 140), top: ui.y, right: 'auto' };
          return h('button', {
            type: 'button',
            className: 'wshud-pill',
            style: pillStyle,
            title: t('show'),
            onClick: () => setUi((value) => ({ ...value, open: true, hidden: false })),
          },
          icon(ICONS.logo, 14),
          h('span', null, t('show')),
          workspaceUsage.total > 0 ? h('span', { className: 'wshud-meta' }, formatTokens(workspaceUsage.total)) : null);
        }

        const cardStyle = ui.x === null ? undefined : { left: ui.x, top: ui.y, right: 'auto' };

        return h('section', {
          ref: cardRef,
          className: 'wshud-card',
          style: cardStyle,
          'aria-label': t('title'),
          'data-workspace-hud': '',
          'data-dragging': dragging ? '' : undefined,
        },
        header,
        ui.open ? h('div', { className: 'wshud-body' }, filesSection, balanceSection, tokensSection) : null);
      }

      ctx.effect(
        () => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'workspace-hud',
          order: 60,
          locale: NS,
        }, WorkspaceHud)),
        'workspace-hud: pinned overlay',
      );
    }

    function summarizeUsage(sessions) {
      const sum = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      let counted = 0;
      for (const session of sessions) {
        const totals = session.totals;
        if (!totals || typeof totals !== 'object') continue;
        counted += 1;
        sum.input += tokenCount(totals.uncachedInputTokens);
        sum.output += tokenCount(totals.outputTokens);
        sum.cacheRead += tokenCount(totals.cacheReadTokens);
        sum.cacheWrite += tokenCount(totals.cacheWriteTokens);
      }
      return {
        ...sum,
        total: sum.input + sum.output + sum.cacheRead + sum.cacheWrite,
        counted,
        sessions: sessions.length,
      };
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'sidebarRight', 'remote', 'remote.account', 'remote.workspaceFiles'],
      apply,
    };
  },
});
