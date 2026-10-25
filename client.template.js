window.__ModuleLoader__.load({
  id: 'dsh-whale-voice',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let stylesApi = null
    try { stylesApi = require('styles') } catch {}

    const CSS = __WHALE_CSS__;

    const NAV = [
      { id: 'overview', label: '总览', en: 'Overview', icon: 'overview', hint: '一眼看清语音系统' },
      { id: 'settings', label: '语音设置', en: 'Voice', icon: 'settings', hint: '开关与生成参数' },
      { id: 'permissions', label: '权限管理', en: 'Access', icon: 'shield', hint: '私聊与群聊白名单' },
      { id: 'safety', label: '发送与安全', en: 'Safety', icon: 'lock', hint: '紧急停止、窗口焦点与游戏保护' },
      { id: 'studio', label: '音色中心', en: 'Studio', icon: 'wave', hint: 'whale-v1 与试听' },
      { id: 'emotions', label: '情绪系统', en: 'Emotion', icon: 'smile', hint: '实验性情绪表达' },
      { id: 'activity', label: '任务与日志', en: 'Activity', icon: 'activity', hint: '任务状态与诊断' },
      { id: 'advanced', label: '高级设置', en: 'Advanced', icon: 'sliders', hint: '引擎与运行环境' },
    ]

    const STATUS = {
      online: { label: '在线', tone: 'online' },
      busy: { label: '忙碌', tone: 'busy' },
      starting: { label: '正在启动', tone: 'starting' },
      offline: { label: '离线', tone: 'offline' },
      error: { label: '异常', tone: 'error' },
      disconnected: { label: '未连接', tone: 'disconnected' },
      unknown: { label: '状态未知', tone: 'unknown' },
      QUEUED: { label: '排队中', tone: 'queued' },
      SYNTHESIZING: { label: '合成中', tone: 'queued' },
      READY: { label: '已就绪', tone: 'ready' },
      WAITING_FOR_UI: { label: '等待界面', tone: 'waiting' },
      RECORDING: { label: '录音中', tone: 'recording' },
      SENDING: { label: '发送中', tone: 'sending' },
      SENT_LOCAL: { label: '本地气泡', tone: 'sent' },
      FAILED: { label: '失败', tone: 'failed' },
      UNKNOWN: { label: '结果未知', tone: 'unknown' },
      REJECTED: { label: '已拒绝', tone: 'rejected' },
      draft: { label: '演示草稿', tone: 'waiting' },
      verified: { label: '已验证', tone: 'online' },
    }

    const DEFAULT_SETTINGS = {
      enabled: false,
      private_enabled: true,
      group_enabled: false,
      explicit_only: true,
      auto: false,
      auto_probability: 0,
      default_voice: 'whale-v1',
      max_chars: 280,
      max_duration: 30,
      timeout: 120,
      language: 'zh-CN',
      format: 'wav',
      queue: 'serial',
      offline_behavior: 'text',
      game_pause: true,
      game_no_focus: true,
      game_offline_text: true,
      auto_start_qwen: false,
    }

    const MOCK_SERVICES = [
      {
        id: 'qwen', name: 'Qwen3-TTS', kind: '本地语音引擎', status: 'online', latency: '46 ms',
        detail: 'Qwen3-TTS-12Hz-1.7B-Base · BF16 / SDPA · 本地 API 127.0.0.1:8765',
        desc: '本地离线合成，当前音色 whale-v1。',
        metrics: [['模型', '1.7B Base'], ['显存策略', 'BF16'], ['Provider', 'qwen-local'], ['队列', '空闲']],
      },
      {
        id: 'sender', name: 'Voice Sender', kind: '桌面音频执行器', status: 'online', latency: '12 ms',
        detail: '本地 Node 服务 · 串行队列 · CABLE 录音 · 右 Alt 发送',
        desc: '负责录音、播放、前台校验和设备恢复。',
        metrics: [['队列', '0'], ['最大录音', '50 s'], ['麦克风', '默认设备'], ['前台守护', '1500 ms']],
      },
      {
        id: 'wechat', name: 'WeChatAgent', kind: '微信原生桥', status: 'busy', latency: '—',
        detail: 'Bridge r4 · OneBot 11229 · Hook 4.1.10.27 · 仅私聊演示联系人',
        desc: '当前处于本地会话切换/演示忙碌状态。',
        metrics: [['Bridge', 'r4'], ['OneBot', '已连接'], ['白名单', '1 个私聊'], ['群聊', '未授权']],
      },
    ]

    const MOCK_ACTIVITIES = [
      { id: 'demo-voice-001', time: '今天 01:37', target: '演示联系人', kind: '私聊', voice: 'whale-v1', synth: '6.9 s', audio: '4.32 s', status: 'SENT_LOCAL', error: '', bubble: '语音3"秒', note: '演示记录：本地气泡已观察，不等同于对方已收到。' },
      { id: 'demo-voice-002', time: '今天 01:23', target: '演示联系人', kind: '私聊', voice: 'whale-v1', synth: '5.9 s', audio: '3.76 s', status: 'FAILED', error: 'not_foreground', bubble: '', note: '演示记录：目标窗口未保持前台，安全拒绝。' },
      { id: 'demo-voice-003', time: '今天 01:22', target: '演示联系人', kind: '私聊', voice: 'whale-v1', synth: '5.4 s', audio: '3.36 s', status: 'FAILED', error: 'not_foreground', bubble: '', note: '演示记录：用户正在操作其他窗口，Worker 在设备切换前终止。' },
      { id: 'demo-voice-004', time: '昨天 23:12', target: '演示联系人', kind: '私聊', voice: 'whale-v1', synth: '7.5 s', audio: '4.80 s', status: 'FAILED', error: 'not_foreground', bubble: '', note: '演示记录：焦点校验失败，麦克风已恢复。' },
      { id: 'demo-voice-005', time: '昨天 22:54', target: '演示联系人', kind: '私聊', voice: 'whale-v1', synth: '4.1 s', audio: '3.12 s', status: 'UNKNOWN', error: 'sender_timeout', bubble: '', note: '演示记录：发送结果不确定，系统不会自动重发。' },
      { id: 'demo-voice-006', time: '昨天 22:31', target: '演示群聊', kind: '群聊', voice: 'whale-v1', synth: '—', audio: '—', status: 'REJECTED', error: 'group_not_allowed', bubble: '', note: '演示记录：群聊未授权，被白名单拒绝。' },
      { id: 'demo-voice-007', time: '昨天 22:18', target: '演示联系人', kind: '私聊', voice: 'whale-v1', synth: '3.8 s', audio: '2.96 s', status: 'QUEUED', error: '', bubble: '', note: '演示记录：队列中，尚未开始合成。' },
      { id: 'demo-voice-008', time: '昨天 21:57', target: '演示联系人', kind: '私聊', voice: 'whale-v1', synth: '5.2 s', audio: '4.04 s', status: 'WAITING_FOR_UI', error: '', bubble: '', note: '演示记录：等待微信窗口与前台条件，未开始录音。' },
    ]

    const PRIVATE_CONTACTS = [
      { id: 'private:demo-1001', name: '演示联系人', verified: true, permission: true, trigger: '明确语音请求', note: '虚构私聊目标，仅用于展示权限行样式。' },
      { id: 'private:demo-2048', name: '海盐', verified: false, permission: false, trigger: '明确语音请求', note: '虚构演示联系人，仅用于展示权限行样式。' },
    ]

    const EMOTIONS = [
      { id: 'neutral', zh: '自然', en: 'Neutral', desc: '平稳、日常的语气。', icon: 'meh' },
      { id: 'gentle', zh: '温柔', en: 'Gentle', desc: '放轻、放慢，适合晚安。', icon: 'heart' },
      { id: 'happy', zh: '开心', en: 'Happy', desc: '更明亮、更有笑意。', icon: 'smile' },
      { id: 'shy', zh: '害羞', en: 'Shy', desc: '轻轻收住，带一点犹豫。', icon: 'shy' },
      { id: 'playful', zh: '俏皮', en: 'Playful', desc: '轻快、带一点小坏。', icon: 'spark' },
      { id: 'sad', zh: '难过', en: 'Sad', desc: '更低、更慢的情绪。', icon: 'sad' },
    ]

    const ADVANCED = {
      engine: [
        ['Provider', 'qwen-local（演示占位）'], ['API 地址', 'http://127.0.0.1:8765'],
        ['模型', 'Qwen3-TTS-12Hz-1.7B-Base'], ['当前音色', 'whale-v1'],
        ['合成超时', '120 s'], ['音频缓存', '已启用 · 本地缓存'],
      ],
      sender: [
        ['服务状态', '在线（演示）'], ['监听地址', '127.0.0.1:43371'],
        ['最大录音', '50 s'], ['前置静音', '1000 ms'],
        ['后置静音', '1000 ms'], ['麦克风恢复', '已恢复 · 无待恢复快照'],
        ['前台守护', '前台/目标校验 · 非 Idle 硬拦截'],
      ],
      wechat: [
        ['Bridge 版本', 'voice-fallback-2026-10-24-r4（演示快照）'],
        ['OneBot', '127.0.0.1:11229 · 已连接'],
        ['目标映射', 'private:demo-1001 → 演示联系人'],
        ['私聊白名单', '1 个（演示联系人）'],
        ['群聊白名单', '0 个'],
        ['配置同步', '只读展示 · 不写入'],
      ],
    }

    const ICON_PATHS = {
      overview: ['M4 4h6v6H4z', 'M14 4h6v10h-6z', 'M4 14h6v6H4z', 'M14 18h6v2h-6z'],
      settings: ['M4 6h16', 'M4 12h16', 'M4 18h16', 'M8 4v4', 'M16 10v4', 'M10 16v4'],
      shield: ['M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z', 'M9 12l2 2 4-4'],
      wave: ['M3 12h2', 'M7 8v8', 'M11 5v14', 'M15 8v8', 'M19 10v4', 'M23 12h-2'],
      smile: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8', 'M9 9h.01', 'M15 9h.01'],
      activity: ['M4 5h16', 'M4 12h10', 'M4 19h7', 'M18 15l2 2 3-3'],
      sliders: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M13 4v6', 'M7 14v6'],
      play: ['M8 5l11 7-11 7z'],
      pause: ['M8 5h3v14H8z', 'M15 5h3v14h-3z'],
      refresh: ['M20 11a8 8 0 1 0-2.3 6.3', 'M20 4v7h-7'],
      search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
      plus: ['M12 5v14', 'M5 12h14'],
      more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
      check: ['M4 12l5 5L20 6'],
      alert: ['M12 3l9 17H3z', 'M12 9v5', 'M12 17h.01'],
      x: ['M6 6l12 12', 'M18 6L6 18'],
      chevron: ['M9 6l6 6-6 6'],
      volume: ['M4 10v4h4l5 4V6l-5 4z', 'M17 9c1 .8 1.6 1.8 1.6 3S18 14.2 17 15', 'M19 6c1.8 1.3 2.8 3.1 2.8 6S20.8 16.7 19 18'],
      mic: ['M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M6 11v1a6 6 0 0 0 12 0v-1', 'M12 18v3', 'M9 21h6'],
      spark: ['M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z', 'M19 3v3', 'M20.5 4.5h-3'],
      gamepad: ['M7 8h10a5 5 0 0 1 4.8 6.4l-.8 2.6a2.2 2.2 0 0 1-3.8.8L15 15H9l-2.2 2.8a2.2 2.2 0 0 1-3.8-.8l-.8-2.6A5 5 0 0 1 7 8z', 'M8 11v3', 'M6.5 12.5h3', 'M16 11h.01', 'M18 13h.01'],
      server: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M8 7h.01', 'M8 17h.01', 'M12 7h6', 'M12 17h6'],
      chat: ['M4 5h16v11H9l-5 4z', 'M8 9h8', 'M8 12h5'],
      copy: ['M9 9h10v12H9z', 'M5 15H3V3h12v2'],
      external: ['M14 4h6v6', 'M20 4l-9 9', 'M19 13v6H5V5h6'],
      info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
      heart: ['M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8z'],
      meh: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 15h8', 'M9 9h.01', 'M15 9h.01'],
      shy: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 14c1.2 1 2.5 1.5 4 1.5s2.8-.5 4-1.5', 'M8 9h.01', 'M16 9h.01'],
      sad: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 16c1-1 2.3-1.5 4-1.5s3 .5 4 1.5', 'M9 9h.01', 'M15 9h.01'],
      lock: ['M5 11h14v9H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
      dot: ['M12 12h.01'],
      clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
      target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
    }

    function Icon({ name, size = 18, strokeWidth = 1.7, className = '' }) {
      const paths = ICON_PATHS[name] || ICON_PATHS.dot
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, className,
        fill: 'none', stroke: 'currentColor', strokeWidth,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, paths.map((d, i) => h('path', { key: i, d })))
    }

    function WhaleGlyph({ size = 24, x = 0, y = 0, className = '', style = null }) {
      return h('svg', {
        x, y, width: size, height: size, viewBox: '0 0 24 24',
        className, style, 'aria-hidden': true, fill: 'none', overflow: 'visible',
      },
        h('path', {
          d: 'M2.4 13.1c2-4.2 5.5-6.3 10.5-6.3 3.9 0 6.7 1.5 8.1 4.6-1.2.2-2.1.9-2.7 2-.8-.6-1.7-.9-2.6-.9-1.2 0-2.3.5-3.2 1.4-1.2 1.2-2.6 1.8-4.2 1.8-2.5 0-4.7-1-6.3-2.6Z',
          fill: 'currentColor', opacity: .95,
        }),
        h('circle', { cx: 9.6, cy: 11.2, r: .85, fill: '#0f1a2e' }),
        h('path', { d: 'M17.4 15.4c1.1.8 1.9 2 2.3 3.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', opacity: .6, vectorEffect: 'non-scaling-stroke' }),
        h('path', { d: 'M19.2 12.8c1.7 1.1 2.8 2.8 3.3 4.9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', opacity: .35, vectorEffect: 'non-scaling-stroke' }))
    }

    function WhaleMark({ size = 22 }) {
      return h(WhaleGlyph, { size, style: { color: 'currentColor' } })
    }

    function WhaleArt() {
      return h('svg', { viewBox: '0 0 340 200', role: 'img', 'aria-label': '小鲸鱼与声波装饰' },
        h('circle', { cx: 170, cy: 100, r: 78, fill: 'none', stroke: 'var(--wv-accent)', strokeOpacity: .04, strokeWidth: 1 }),
        h('circle', { cx: 170, cy: 100, r: 58, fill: 'none', stroke: 'var(--wv-accent)', strokeOpacity: .05, strokeWidth: 1 }),
        h('circle', { cx: 170, cy: 100, r: 38, fill: 'none', stroke: 'var(--wv-accent)', strokeOpacity: .06, strokeWidth: 1 }),
        h('g', { opacity: .25 }, [0, 1, 2, 3, 4].map((i) => h('circle', {
          key: i, cx: 264 + i * 9, cy: 64 - i * 2.5, r: 1.8 - i * .12, fill: 'var(--wv-accent)',
        }))),
        h(WhaleGlyph, { size: 150, x: 94, y: 30, style: { color: 'var(--wv-accent)' } }))
    }

    function SidebarIcon({ size = 20, active = false }) {
      return h('span', {
        style: {
          display: 'grid', placeItems: 'center', width: size, height: size,
          color: active ? 'var(--wv-accent)' : 'var(--wv-muted)',
          transition: 'color .16s ease',
        },
      }, h(WhaleMark, { size }))
    }

    function cls(...parts) { return parts.filter(Boolean).join(' ') }

    function Button({ children, variant = '', size = '', className = '', ...rest }) {
      return h('button', { type: 'button', className: cls('wv-btn', variant, size, className), ...rest }, children)
    }

    function IconButton({ icon, label, ...rest }) {
      return h('button', { type: 'button', className: 'wv-iconbtn', 'aria-label': label, title: label, ...rest }, h(Icon, { name: icon, size: 16 }))
    }

    function Toggle({ checked, onChange, disabled = false, label, saving = false }) {
      return h('button', {
        type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label,
        title: label, disabled,
        className: cls('wv-switch', saving && 'saving'),
        onClick: () => { if (!disabled) onChange(!checked) },
      })
    }

    function Badge({ children, tone = 'demo' }) {
      return h('span', { className: 'wv-badge ' + tone }, children)
    }

    function Status({ status, label }) {
      const s = STATUS[status] || { label: label || status, tone: 'unknown' }
      return h('span', { className: 'wv-status ' + s.tone }, label || s.label)
    }

    function Tip({ text }) {
      return h('span', { className: 'wv-tip', tabIndex: 0, 'aria-label': text }, '?', h('span', { className: 'wv-tiptext' }, text))
    }

    function Card({ title, desc, actions, children, className = '', soft = false }) {
      return h('section', { className: cls('wv-card', 'pad', soft && 'soft', className) },
        (title || actions) ? h('div', { className: 'wv-card-title' },
          h('div', null, title ? h('h2', null, title) : null, desc ? h('p', null, desc) : null),
          actions ? h('div', { className: 'wv-actions' }, actions) : null) : null,
        children)
    }

    function PageHead({ eyebrow, title, description, actions }) {
      return h('header', { className: 'wv-pagehead' },
        h('div', { className: 'wv-pagehead-main' },
          h('div', { className: 'wv-eyebrow' }, eyebrow),
          h('h1', null, title),
          description ? h('p', null, description) : null),
        actions ? h('div', { className: 'wv-pagehead-actions' }, actions) : null)
    }

    function Empty({ icon = 'info', title, children, action }) {
      return h('div', { className: 'wv-empty' },
        h('div', { className: 'wv-empty-icon' }, h(Icon, { name: icon, size: 18 })),
        h('strong', null, title),
        children ? h('p', null, children) : null,
        action || null)
    }

    function WaveBars({ count = 34, className = '', played = 0, seed = 7 }) {
      const bars = []
      for (let i = 0; i < count; i += 1) {
        const v = (Math.sin((i + seed) * 1.37) + Math.cos((i + seed) * .53) + 2) / 4
        const height = Math.max(4, Math.round(8 + v * (i % 5 === 0 ? 26 : 18)))
        bars.push(h('i', { key: i, className: i < played ? 'on' : '', style: { height: height + 'px' } }))
      }
      return h('div', { className: cls('wv-studio-wave', className), 'aria-hidden': true }, bars)
    }

    function MiniWave({ count = 30 }) {
      const bars = []
      for (let i = 0; i < count; i += 1) {
        const v = (Math.sin(i * .9) + Math.cos(i * .41) + 2) / 4
        bars.push(h('i', { key: i, style: { height: Math.round(5 + v * 26) + 'px' } }))
      }
      return h('div', { className: 'wv-wave-mini', 'aria-hidden': true }, bars)
    }

    function Modal({ title, subtitle, size = '', onClose, children, footer }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const previous = document.activeElement
        const node = ref.current
        const focusables = node ? node.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') : []
        const first = focusables && focusables[0]
        if (first && first.focus) first.focus()
        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
          if (e.key !== 'Tab' || !node) return
          const list = Array.from(node.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((x) => !x.disabled)
          if (!list.length) return
          const firstEl = list[0], lastEl = list[list.length - 1]
          if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
          else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
        }
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('keydown', onKey)
          if (previous && previous.focus) previous.focus()
        }
      }, [onClose])
      return h('div', {
        className: 'wv-overlay',
        onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() },
      }, h('div', { ref, className: cls('wv-dialog', size), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wv-dialog-title' },
        h('div', { className: 'wv-dialog-head' },
          h('div', null, h('h2', { id: 'wv-dialog-title' }, title), subtitle ? h('p', null, subtitle) : null),
          h(IconButton, { icon: 'x', label: '关闭', onClick: onClose })),
        h('div', { className: 'wv-dialog-body' }, children),
        footer ? h('div', { className: 'wv-dialog-foot' }, footer) : null))
    }

    function Toast({ toast }) {
      if (!toast) return null
      return h('div', { className: 'wv-toast ' + (toast.tone || ''), role: 'status' },
        h(Icon, { name: toast.tone === 'error' ? 'alert' : 'check', size: 15 }),
        h('span', null, toast.message))
    }

    function Sidebar({ page, setPage, settings, layout }) {
      return h('aside', { className: 'wv-sidebar', 'aria-label': 'Whale Voice 导航' },
        h('div', { className: 'wv-brand' },
          h('div', { className: 'wv-brandmark' }, h(WhaleMark, { size: 22 })),
          h('div', { className: 'wv-brandtext' },
            h('div', { className: 'wv-brandname' }, 'Whale Voice'),
            h('div', { className: 'wv-brandsub' }, '小鲸鱼语音中心'))),
        h('nav', { className: 'wv-nav' }, NAV.map((item) => h('button', {
          key: item.id, type: 'button', className: 'wv-navitem',
          'aria-current': page === item.id ? 'page' : undefined,
          title: layout === 'compact' ? item.label + ' · ' + item.en : item.hint,
          onClick: () => setPage(item.id),
        },
          h('span', { className: 'wv-navicon' }, h(Icon, { name: item.icon, size: 17 })),
          h('span', { className: 'wv-navlabel' }, item.label),
          item.id === 'activity' ? h('span', { className: 'wv-navbadge' }, '9') : null))),
        h('div', { className: 'wv-sidefoot' },
          h('div', { className: 'wv-sidefootrow' }, h('span', { className: 'wv-live' }, '真实配置只读'), h('strong', null, '生产写入禁用')),
          h('div', { className: 'wv-sidefootrow' }, h('span', null, 'Qwen3-TTS'), h('strong', null, 'whale-v1')),
          h('div', { className: 'wv-sidefootrow' }, h('span', null, '前端版本'), h('strong', null, 'v0.1.0'))))
    }

    function Topbar({ page, layout, notify }) {
      const item = NAV.find((x) => x.id === page) || NAV[0]
      return h('header', { className: 'wv-topbar' },
        h('div', { className: 'wv-topbar-left' },
          layout === 'narrow' ? h('span', { className: 'wv-brandmark', style: { width: 26, height: 26, borderRadius: 8 } }, h(WhaleMark, { size: 16 })) : null,
          h('div', { className: 'wv-crumb' }, h('b', null, 'Whale Voice'), h('span', null, '/'), h('span', null, item.label), h('span', null, '·'), h('span', null, item.en))),
        h('div', { className: 'wv-topbar-actions' },
          h('span', { className: 'wv-demo', title: '标记为演示的服务指标、联系人与任务为前端演示数据；真实 Core 面板来自只读接口，不写入生产配置。' }, '部分演示'),
          h('span', { className: 'wv-topmeta' }, '真实配置只读 · 生产写入禁用'),
          h(IconButton, { icon: 'refresh', label: '刷新演示数据', onClick: () => notify('演示数据已刷新；真实 Core 状态与能力请在组件管理中重新检测。', 'success') })))
    }

    function ServiceDialog({ service, onClose }) {
      return h(Modal, { title: service.name, subtitle: service.kind + ' · 演示详情', onClose, size: '',
        footer: h(Button, { onClick: onClose }, '关闭') },
        h('div', { className: 'wv-stack' },
          h('div', { className: 'wv-between' }, h(Status, { status: service.status }), h(Badge, { tone: 'demo' }, '演示')),
          h('p', { className: 'wv-muted', style: { margin: 0, fontSize: 12 } }, service.desc),
          h('dl', { className: 'wv-kv' },
            service.metrics.map(([k, v], i) => h(React.Fragment, { key: i }, h('dt', null, k), h('dd', null, v))),
            h('dt', null, '接口'), h('dd', null, service.detail)),
          h('div', { className: 'wv-notice warn' }, h(Icon, { name: 'info', size: 15 }), h('span', null, '该面板为只读演示，不会启动、停止或重启任何服务。'))))
    }

    function ActivityDialog({ activity, onClose, notify }) {
      const copy = async () => {
        const ok = await copyText(activity.error || activity.id)
        notify(ok ? '已复制到剪贴板。' : '复制失败：当前环境不允许访问剪贴板。', ok ? 'success' : 'error')
      }
      return h(Modal, { title: '任务详情', subtitle: activity.id + ' · 演示记录', onClose,
        footer: h(React.Fragment, null,
          h(Button, { onClick: copy }, h(Icon, { name: 'copy', size: 14 }), activity.error ? '复制错误' : '复制 ID'),
          h(Button, { variant: 'primary', onClick: onClose }, '关闭')) },
        h('div', { className: 'wv-stack' },
          h('div', { className: 'wv-between' }, h(Status, { status: activity.status }), h(Badge, { tone: 'demo' }, '演示数据')),
          h('dl', { className: 'wv-kv' },
            h('dt', null, '时间'), h('dd', null, activity.time),
            h('dt', null, '目标'), h('dd', null, activity.target + ' · ' + activity.kind),
            h('dt', null, '音色'), h('dd', null, activity.voice),
            h('dt', null, '合成 / 音频'), h('dd', null, activity.synth + ' / ' + activity.audio),
            h('dt', null, '气泡'), h('dd', null, activity.bubble || '—'),
            h('dt', null, '错误'), h('dd', null, activity.error ? h('code', { className: 'wv-code' }, activity.error) : '—')),
          h('div', { className: activity.status === 'UNKNOWN' ? 'wv-notice warn' : 'wv-notice' },
            h(Icon, { name: activity.status === 'UNKNOWN' ? 'alert' : 'info', size: 15 }),
            h('span', null, activity.status === 'UNKNOWN'
              ? '发送结果不确定。系统不会自动补发文字或语音；请人工确认。'
              : activity.note)),
          h('p', { className: 'wv-muted', style: { margin: 0, fontSize: 11.5 } }, '这是前端演示记录，不读取真实聊天内容，也不代表真实任务状态。')))
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text)
          return true
        }
      } catch {}
      try {
        const el = document.createElement('textarea')
        el.value = text
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        const ok = document.execCommand('copy')
        el.remove()
        return ok
      } catch { return false }
    }

    function useLayout(ref) {
      const [layout, setLayout] = React.useState('wide')
      React.useEffect(() => {
        const el = ref.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver((entries) => {
          const w = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : el.clientWidth
          setLayout(w < 620 ? 'narrow' : w < 940 ? 'compact' : 'wide')
        })
        ro.observe(el)
        return () => ro.disconnect()
      }, [ref])
      return layout
    }

    // __PAGES__

    function WhaleVoiceApp({ locale }) {
      const rootRef = React.useRef(null)
      const layout = useLayout(rootRef)
      const [page, setPage] = React.useState('overview')
      const [settings, setSettings] = React.useState(DEFAULT_SETTINGS)
      const [saved, setSaved] = React.useState(DEFAULT_SETTINGS)
      const [contacts, setContacts] = React.useState(PRIVATE_CONTACTS)
      const [groups, setGroups] = React.useState([])
      const [emotion, setEmotion] = React.useState('neutral')
      const [preview, setPreview] = React.useState({ text: '晚安演示联系人，今天辛苦啦，我在这儿呢。', voice: 'whale-v1', language: 'zh-CN', emotion: 'neutral', volume: 60 })
      const [serviceDetail, setServiceDetail] = React.useState(null)
      const [activityDetail, setActivityDetail] = React.useState(null)
      const [confirmReset, setConfirmReset] = React.useState(false)
      const [toast, setToast] = React.useState(null)
      const [setup, setSetup] = React.useState({ checking: true, available: false, reason: '', data: null })
      const [capability, setCapability] = React.useState({ checking: true, available: false, reason: '', data: null })
      const [setupOpen, setSetupOpen] = React.useState(false)
      const [componentsOpen, setComponentsOpen] = React.useState(false)
      const autoSetupOpened = React.useRef(false)
      const setupScanGate = React.useRef(null)
      if (!setupScanGate.current) setupScanGate.current = createSetupScanGate()
      const dirty = JSON.stringify(settings) !== JSON.stringify(saved)

      const refreshSetup = async () => {
        const seq = setupScanGate.current.begin()
        setSetup((s) => ({ ...s, checking: true }))
        setCapability((c) => ({ ...c, checking: true }))
        const [next, nextCapability] = await Promise.all([readSetupStatus(), readSetupCapabilities()])
        if (!setupScanGate.current.isCurrent(seq)) return next
        setSetup(next)
        setCapability(nextCapability)
        if (next.available && next.data && next.data.completed === false && !autoSetupOpened.current) {
          autoSetupOpened.current = true
          setSetupOpen(true)
        }
        return next
      }

      React.useEffect(() => {
        let alive = true
        const seq = setupScanGate.current.begin()
        Promise.all([readSetupStatus(), readSetupCapabilities()]).then(([next, nextCapability]) => {
          if (!alive || !setupScanGate.current.isCurrent(seq)) return
          setSetup(next)
          setCapability(nextCapability)
          if (next.available && next.data && next.data.completed === false && !autoSetupOpened.current) {
            autoSetupOpened.current = true
            setSetupOpen(true)
          }
        })
        return () => { alive = false }
      }, [])

      React.useEffect(() => {
        if (!toast) return
        const t = setTimeout(() => setToast(null), 3400)
        return () => clearTimeout(t)
      }, [toast])

      React.useEffect(() => {
        const loc = locale
        if (!loc || !loc.subscribe) return
        const off = loc.subscribe(() => {})
        return () => { try { off() } catch {} }
      }, [locale])

      const notify = (message, tone = 'info') => setToast({ message, tone, key: Date.now() })
      const setSetting = (key, value) => setSettings((s) => ({ ...s, [key]: value }))
      const toggleSetting = (key) => (value) => setSetting(key, value)
      const saveSettings = () => {
        setSaved(settings)
        notify('已保存到前端演示草稿；未写入生产配置。', 'success')
      }
      const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS)
        setSaved(DEFAULT_SETTINGS)
        setConfirmReset(false)
        notify('已恢复安全默认演示设置。', 'success')
      }
      const addGroup = (draft) => {
        setGroups((list) => list.concat(draft))
        notify('已保存为前端演示草稿；未核验、未写入真实群聊白名单。', 'success')
      }
      const removeGroup = (id) => {
        setGroups((list) => list.filter((g) => g.id !== id))
        notify('已从演示草稿移除；真实白名单未变化。', 'success')
      }

      let body = null
      if (page === 'overview') body = h(OverviewPage, { settings, setSetting, setPage, notify, openService: setServiceDetail, openActivity: setActivityDetail, setup, capability, onSetup: () => setSetupOpen(true), onComponents: () => setComponentsOpen(true) })
      else if (page === 'settings') body = h(SettingsPage, { settings, setSetting, dirty, saveSettings, resetSettings: () => setConfirmReset(true), notify, setup, capability })
      else if (page === 'permissions') body = h(PermissionsPage, { contacts, setContacts, groups, addGroup, removeGroup, notify, setup, capability })
      else if (page === 'safety') body = h(SafetyPage, { settings, setup, capability })
      else if (page === 'studio') body = h(StudioPage, { preview, setPreview, notify, setup, capability })
      else if (page === 'emotions') body = h(EmotionsPage, { emotion, setEmotion, notify })
      else if (page === 'activity') body = h(ActivityPage, { notify, openActivity: setActivityDetail })
      else if (page === 'advanced') body = h(AdvancedPage, { notify, setup, capability, onSetup: () => setSetupOpen(true), onComponents: () => setComponentsOpen(true) })
      else body = h(OverviewPage, { settings, setSetting, setPage, notify, openService: setServiceDetail, openActivity: setActivityDetail, setup, capability, onSetup: () => setSetupOpen(true), onComponents: () => setComponentsOpen(true) })

      return h('div', { ref: rootRef, className: 'wv-root', 'data-layout': layout },
        h('div', { className: 'wv-aurora', 'aria-hidden': true }),
        h('div', { className: 'wv-shell' },
          h(Sidebar, { page, setPage, settings, layout }),
          h('div', { className: 'wv-main' },
            h(Topbar, { page, layout, notify }),
            h('div', { className: 'wv-scroll' },
              h('div', { className: 'wv-content' },
                h('div', { className: 'wv-page', key: page }, body))))),
        serviceDetail ? h(ServiceDialog, { service: serviceDetail, onClose: () => setServiceDetail(null) }) : null,
        activityDetail ? h(ActivityDialog, { activity: activityDetail, onClose: () => setActivityDetail(null), notify }) : null,
        confirmReset ? h(Modal, {
          title: '恢复默认演示设置？', subtitle: '只影响当前前端状态，不会写入生产配置。', size: 'sm', onClose: () => setConfirmReset(false),
          footer: h(React.Fragment, null,
            h(Button, { onClick: () => setConfirmReset(false) }, '取消'),
            h(Button, { variant: 'danger', onClick: resetSettings }, '恢复默认')),
        }, h('p', { style: { margin: 0, color: 'var(--wv-muted)', fontSize: 12, lineHeight: 1.6 } }, '当前未保存的演示表单内容会丢失。')) : null,
        setupOpen ? h(SetupWizard, {
          open: true, status: setup, onClose: () => setSetupOpen(false), onRefresh: refreshSetup, onNotify: notify,
          onGoPermissions: () => { setSetupOpen(false); setPage('permissions') },
        }) : null,
        componentsOpen ? h(ComponentsDialog, {
          open: true, status: setup, capability, onClose: () => setComponentsOpen(false), onRefresh: refreshSetup,
          onSetup: () => { setComponentsOpen(false); setSetupOpen(true) },
          onAdvanced: () => { setComponentsOpen(false); setPage('advanced') }, onNotify: notify,
        }) : null,
        h(Toast, { toast }))
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      let disposeStyle = null
      try {
        if (stylesApi && stylesApi.insert) disposeStyle = stylesApi.insert(CSS)
      } catch {}
      if (!disposeStyle) {
        const el = document.createElement('style')
        el.setAttribute('data-whale-voice', '')
        el.textContent = CSS
        document.head.appendChild(el)
        disposeStyle = () => el.remove()
      }
      if (typeof disposeStyle === 'function') ctx.effect(() => disposeStyle, 'whale-voice: styles')

      ctx.effect(() => slots.inject('sidebar.panellist', () => slots.register(
        { name: 'sidebar.panellist', id: 'whale-voice', order: 30, label: 'Whale Voice' },
        SidebarIcon,
      )), 'whale-voice: sidebar entry')

      ctx.effect(() => slots.inject('main', () => slots.register(
        { name: 'main', key: 'whale-voice' },
        () => h(WhaleVoiceApp, { locale: ctx.get('locale') }),
      )), 'whale-voice: main panel')
    }

    return { inject: ['slots'], apply }
  },
})
