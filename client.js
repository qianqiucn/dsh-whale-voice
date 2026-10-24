window.__ModuleLoader__.load({
  id: 'dsh-whale-voice',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let stylesApi = null
    try { stylesApi = require('styles') } catch {}

    const CSS = ".wv-root {\n  --wv-bg: var(--dsw-alias-bg-base);\n  --wv-base: #0e1624;\n  --wv-card-base: rgba(22, 31, 48, .78);\n  --wv-card-solid: #172133;\n  --wv-layer1: var(--dsw-alias-bg-layer-1);\n  --wv-layer2: var(--dsw-alias-bg-layer-2);\n  --wv-overlay: var(--dsw-alias-bg-overlay);\n  --wv-text: var(--dsw-alias-label-primary);\n  --wv-muted: color-mix(in srgb, var(--dsw-alias-label-secondary) 82%, var(--dsw-alias-label-primary));\n  --wv-muted-soft: color-mix(in srgb, var(--dsw-alias-label-secondary) 92%, var(--dsw-alias-label-primary));\n  --wv-border: var(--dsw-alias-border-l1);\n  --wv-border-strong: var(--dsw-alias-border-l2);\n  --wv-accent: var(--dsw-alias-brand-primary);\n  --wv-accent2: color-mix(in srgb, #a99bf5 58%, var(--dsw-alias-brand-primary));\n  --wv-success: var(--dsw-alias-state-success-primary);\n  --wv-warn: var(--dsw-alias-state-warn-primary);\n  --wv-error: var(--dsw-alias-state-error-primary);\n  --wv-idle: var(--dsw-alias-state-idle-primary);\n  --wv-glass: color-mix(in srgb, var(--wv-layer1) 58%, transparent);\n  --wv-card-fill: color-mix(in srgb, var(--wv-layer1) 64%, transparent);\n  --wv-card-fill-strong: color-mix(in srgb, var(--wv-layer1) 72%, transparent);\n  --wv-glass-strong: color-mix(in srgb, var(--wv-overlay) 88%, transparent);\n  --wv-soft: color-mix(in srgb, var(--wv-accent) 8%, transparent);\n  --wv-soft2: color-mix(in srgb, var(--wv-accent2) 8%, transparent);\n  --wv-hairline: color-mix(in srgb, var(--wv-border) 82%, transparent);\n  --wv-r-xs: 8px;\n  --wv-r-sm: 11px;\n  --wv-r-md: 14px;\n  --wv-r-lg: 16px;\n  --wv-r-xl: 22px;\n  --wv-frame-inset: 14px;\n  --wv-frame-radius: 16px;\n  --wv-frame-border: color-mix(in srgb, var(--wv-text) 11%, transparent);\n  --wv-frame-shadow: 0 10px 30px color-mix(in srgb, #000 16%, transparent);\n  --wv-shadow: 0 16px 44px color-mix(in srgb, var(--wv-text) 8%, transparent);\n  --wv-shadow-soft: 0 10px 28px color-mix(in srgb, var(--wv-text) 5%, transparent);\n  position: relative;\n  display: block;\n  width: calc(100% - var(--wv-frame-inset) * 2);\n  height: calc(100% - var(--wv-frame-inset) * 2);\n  margin: var(--wv-frame-inset);\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  border: 1px solid var(--wv-frame-border);\n  border-radius: var(--wv-frame-radius);\n  box-shadow: var(--wv-frame-shadow);\n  isolation: isolate;\n  color: var(--wv-text);\n  font-family: var(--dsw-font-family, \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif);\n  font-size: 13.5px;\n  line-height: 1.6;\n  -webkit-font-smoothing: antialiased;\n  background:\n    radial-gradient(900px 500px at -10% -14%, color-mix(in srgb, var(--wv-accent) 11%, transparent), transparent 64%),\n    radial-gradient(760px 460px at 108% -8%, color-mix(in srgb, var(--wv-accent2) 9%, transparent), transparent 66%),\n    linear-gradient(155deg, color-mix(in srgb, var(--wv-base) 89%, transparent), color-mix(in srgb, var(--wv-base) 96%, transparent));\n  -webkit-backdrop-filter: blur(30px) saturate(1.05);\n  backdrop-filter: blur(30px) saturate(1.05);\n  box-sizing: border-box;\n}\n.wv-root *, .wv-root *::before, .wv-root *::after { box-sizing: border-box; }\nbody[data-ds-dark-theme] .wv-root {\n  --wv-base: #0e1624;\n  --wv-card-base: rgba(22, 31, 48, .78);\n  --wv-card-solid: #172133;\n}\nbody:not([data-ds-dark-theme]) .wv-root {\n  --wv-base: #f3f5fb;\n  --wv-card-base: rgba(255, 255, 255, .82);\n  --wv-card-solid: #ffffff;\n}\n.wv-root button, .wv-root input, .wv-root select, .wv-root textarea { font: inherit; color: inherit; }\n.wv-root button { cursor: pointer; }\n.wv-root button:disabled { cursor: default; }\n.wv-root :focus-visible { outline: 2px solid color-mix(in srgb, var(--wv-accent) 75%, transparent); outline-offset: 2px; }\n.wv-root ::selection { background: color-mix(in srgb, var(--wv-accent) 26%, transparent); }\n\n.wv-aurora { position: absolute; inset: -20%; pointer-events: none; z-index: -1; opacity: .45; filter: blur(12px); }\n.wv-aurora::before, .wv-aurora::after { content: \"\"; position: absolute; border-radius: 50%; }\n.wv-aurora::before {\n  width: 46%; height: 46%; left: 16%; top: 8%;\n  background: radial-gradient(circle, color-mix(in srgb, var(--wv-accent) 10%, transparent), transparent 68%);\n  animation: wv-drift 26s ease-in-out infinite alternate;\n}\n.wv-aurora::after {\n  width: 40%; height: 40%; right: 6%; bottom: 4%;\n  background: radial-gradient(circle, color-mix(in srgb, var(--wv-accent2) 9%, transparent), transparent 68%);\n  animation: wv-drift 32s ease-in-out infinite alternate-reverse;\n}\n@keyframes wv-drift { from { transform: translate3d(-2%, -1%, 0) scale(1); } to { transform: translate3d(3%, 2%, 0) scale(1.06); } }\n\n.wv-shell { position: relative; z-index: 1; display: grid; grid-template-columns: 208px minmax(0, 1fr); width: 100%; height: 100%; min-height: 0; }\n\n.wv-sidebar {\n  display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: 0;\n  padding: 18px 12px 14px;\n  border-right: 1px solid var(--wv-hairline);\n  background: linear-gradient(180deg, color-mix(in srgb, var(--wv-base) 88%, transparent), color-mix(in srgb, var(--wv-base) 96%, transparent));\n}\n.wv-brand { display: flex; align-items: center; gap: 11px; min-width: 0; padding: 2px 8px 14px; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 72%, transparent); }\n.wv-brandmark { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; color: var(--wv-accent); background: linear-gradient(145deg, color-mix(in srgb, var(--wv-accent) 18%, transparent), color-mix(in srgb, var(--wv-accent2) 14%, transparent)); border: 1px solid color-mix(in srgb, var(--wv-accent) 22%, var(--wv-hairline)); box-shadow: 0 6px 18px color-mix(in srgb, var(--wv-accent) 12%, transparent); }\n.wv-brandtext { min-width: 0; }\n.wv-brandname { font-size: 14.5px; font-weight: 680; letter-spacing: .01em; white-space: nowrap; }\n.wv-brandsub { margin-top: 1px; font-size: 12px; color: var(--wv-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\n.wv-nav { display: flex; flex-direction: column; gap: 4px; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 2px; scrollbar-width: thin; }\n.wv-navitem {\n  position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px;\n  padding: 8px 10px; border: 1px solid transparent; border-radius: var(--wv-r-sm);\n  background: transparent; color: var(--wv-muted); text-align: left; text-decoration: none;\n  transition: color .16s ease, background .16s ease, border-color .16s ease, transform .16s ease;\n}\n.wv-navitem:hover { color: var(--wv-text); background: color-mix(in srgb, var(--wv-layer2) 44%, transparent); }\n.wv-navitem[aria-current=\"page\"] {\n  color: var(--wv-text);\n  background: linear-gradient(90deg, color-mix(in srgb, var(--wv-accent) 13%, transparent), color-mix(in srgb, var(--wv-accent2) 6%, transparent));\n  border-color: color-mix(in srgb, var(--wv-accent) 18%, var(--wv-hairline));\n  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--wv-accent) 78%, transparent);\n}\n.wv-navicon { flex: none; display: grid; place-items: center; width: 22px; height: 22px; opacity: .92; }\n.wv-navlabel { flex: 1; min-width: 0; font-size: 13px; font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-navbadge { flex: none; min-width: 20px; padding: 1px 6px; border-radius: 999px; font-size: 11px; text-align: center; color: var(--wv-muted); background: color-mix(in srgb, var(--wv-layer2) 70%, transparent); border: 1px solid var(--wv-hairline); }\n.wv-navitem[aria-current=\"page\"] .wv-navbadge { color: var(--wv-accent); border-color: color-mix(in srgb, var(--wv-accent) 24%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-accent) 10%, transparent); }\n\n.wv-sidefoot { margin-top: auto; padding: 12px 8px 2px; border-top: 1px solid color-mix(in srgb, var(--wv-hairline) 72%, transparent); display: flex; flex-direction: column; gap: 7px; }\n.wv-sidefootrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--wv-muted); }\n.wv-sidefoot strong { font-weight: 600; color: color-mix(in srgb, var(--wv-text) 82%, var(--wv-muted)); }\n.wv-live { display: inline-flex; align-items: center; gap: 5px; }\n.wv-live::before { content: \"\"; width: 6px; height: 6px; border-radius: 50%; background: var(--wv-warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--wv-warn) 12%, transparent); }\n\n.wv-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }\n.wv-topbar { position: relative; z-index: 3; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 52px; padding: 8px 24px; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 68%, transparent); background: color-mix(in srgb, var(--wv-base) 78%, transparent); }\n.wv-topbar-left { display: flex; align-items: center; gap: 10px; min-width: 0; }\n.wv-crumb { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--wv-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-crumb b { color: color-mix(in srgb, var(--wv-text) 88%, var(--wv-muted)); font-weight: 600; }\n.wv-topbar-actions { display: flex; align-items: center; gap: 8px; flex: none; }\n.wv-demo { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 999px; color: var(--wv-warn); background: color-mix(in srgb, var(--wv-warn) 9%, transparent); border: 1px solid color-mix(in srgb, var(--wv-warn) 22%, transparent); font-size: 11px; font-weight: 600; letter-spacing: .04em; white-space: nowrap; }\n.wv-demo::before { content: \"\"; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }\n.wv-topmeta { color: var(--wv-muted); font-size: 11.5px; white-space: nowrap; }\n\n.wv-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; scrollbar-width: thin; }\n.wv-scroll::-webkit-scrollbar, .wv-nav::-webkit-scrollbar { width: 8px; }\n.wv-scroll::-webkit-scrollbar-thumb, .wv-nav::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--wv-muted) 24%, transparent); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }\n.wv-scroll::-webkit-scrollbar-track { background: transparent; }\n.wv-content { width: 100%; max-width: none; margin: 0; padding: 22px 24px 96px; }\n.wv-page { animation: wv-pagein .18s ease both; }\n@keyframes wv-pagein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }\n\n.wv-pagehead { display: flex; align-items: flex-end; justify-content: space-between; gap: 22px; margin: 0 0 18px; min-width: 0; }\n.wv-pagehead-main { min-width: 0; }\n.wv-eyebrow { display: flex; align-items: center; gap: 7px; color: var(--wv-accent); font-size: 11px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; }\n.wv-eyebrow::before { content: \"\"; width: 18px; height: 1px; background: currentColor; opacity: .55; }\n.wv-pagehead h1 { margin: 7px 0 0; font-size: clamp(22px, 2.1vw, 27px); line-height: 1.18; font-weight: 680; letter-spacing: -.02em; }\n.wv-pagehead p { margin: 6px 0 0; max-width: 760px; color: var(--wv-muted); font-size: 13px; line-height: 1.55; }\n.wv-pagehead-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; flex: none; }\n\n.wv-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 32px; padding: 6px 12px; border-radius: 9px; border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-layer2) 58%, transparent); color: var(--wv-text); font-size: 13px; font-weight: 560; white-space: nowrap; transition: background .15s ease, border-color .15s ease, transform .12s ease, opacity .15s ease; }\n.wv-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--wv-accent) 45%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-layer2) 82%, transparent); }\n.wv-btn:active:not(:disabled) { transform: translateY(1px); }\n.wv-btn:disabled { opacity: .46; }\n.wv-btn.primary { color: var(--dsw-alias-label-primary-foreground, #fff); background: linear-gradient(145deg, color-mix(in srgb, var(--wv-accent) 92%, #fff 8%), color-mix(in srgb, var(--wv-accent2) 30%, var(--wv-accent))); border-color: color-mix(in srgb, var(--wv-accent) 70%, transparent); box-shadow: 0 6px 18px color-mix(in srgb, var(--wv-accent) 20%, transparent); }\n.wv-btn.primary:hover:not(:disabled) { background: linear-gradient(145deg, color-mix(in srgb, var(--wv-accent) 84%, #fff 16%), color-mix(in srgb, var(--wv-accent2) 38%, var(--wv-accent))); }\n.wv-btn.ghost { background: transparent; border-color: transparent; color: var(--wv-muted); }\n.wv-btn.ghost:hover:not(:disabled) { color: var(--wv-text); background: color-mix(in srgb, var(--wv-layer2) 46%, transparent); border-color: transparent; }\n.wv-btn.danger { color: var(--wv-error); border-color: color-mix(in srgb, var(--wv-error) 25%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-error) 7%, transparent); }\n.wv-btn.sm { min-height: 27px; padding: 4px 9px; font-size: 12px; border-radius: 7px; }\n.wv-iconbtn { display: inline-grid; place-items: center; width: 30px; height: 30px; padding: 0; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--wv-muted); }\n.wv-iconbtn:hover { color: var(--wv-text); background: color-mix(in srgb, var(--wv-layer2) 52%, transparent); border-color: var(--wv-hairline); }\n\n.wv-card { position: relative; border: 1px solid var(--wv-hairline); border-radius: var(--wv-r-lg); background: linear-gradient(180deg, var(--wv-card-base), color-mix(in srgb, var(--wv-card-base) 86%, var(--wv-base))); box-shadow: 0 1px 0 color-mix(in srgb, #fff 6%, transparent) inset, var(--wv-shadow-soft); }\n.wv-card.pad { padding: 17px; }\n.wv-card.soft { background: color-mix(in srgb, var(--wv-card-base) 68%, transparent); box-shadow: none; }\n.wv-card-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: 0 0 12px; }\n.wv-card-title h2 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em; }\n.wv-card-title p { margin: 3px 0 0; color: var(--wv-muted); font-size: 12.5px; line-height: 1.5; }\n.wv-card-title .wv-actions { display: flex; align-items: center; gap: 7px; flex: none; }\n\n.wv-hero { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(220px, .7fr); gap: 18px; overflow: hidden; padding: 20px 22px; border-radius: var(--wv-r-xl); border: 1px solid color-mix(in srgb, var(--wv-accent) 13%, var(--wv-hairline)); background: linear-gradient(125deg, color-mix(in srgb, var(--wv-card-base) 94%, transparent), color-mix(in srgb, var(--wv-accent2) 5%, transparent) 58%, color-mix(in srgb, var(--wv-accent) 6%, transparent)); box-shadow: var(--wv-shadow); }\n.wv-hero-copy { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; }\n.wv-hero .wv-eyebrow { color: color-mix(in srgb, var(--wv-accent) 84%, var(--wv-text)); }\n.wv-hero h1 { margin: 8px 0 0; font-size: clamp(25px, 2.7vw, 34px); line-height: 1.08; letter-spacing: -.032em; font-weight: 690; }\n.wv-hero h1 span { color: color-mix(in srgb, var(--wv-accent) 78%, var(--wv-text)); }\n.wv-hero p { margin: 9px 0 0; max-width: 600px; color: var(--wv-muted); font-size: 13.5px; line-height: 1.55; }\n.wv-hero-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; }\n.wv-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-layer1) 58%, transparent); color: var(--wv-muted); font-size: 11.5px; white-space: nowrap; }\n.wv-chip strong { color: var(--wv-text); font-weight: 600; }\n.wv-chip.accent { color: var(--wv-accent); border-color: color-mix(in srgb, var(--wv-accent) 22%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-accent) 8%, transparent); }\n.wv-hero-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }\n.wv-hero-art { position: relative; min-height: 168px; display: grid; place-items: center; }\n.wv-hero-art svg { width: min(100%, 280px); height: auto; overflow: visible; filter: drop-shadow(0 14px 26px color-mix(in srgb, var(--wv-accent) 13%, transparent)); }\n\n.wv-grid { display: grid; gap: 16px; min-width: 0; }\n.wv-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 0 0 10px; }\n.wv-section-kicker { display: block; color: var(--wv-accent); font-size: 10.5px; font-weight: 650; letter-spacing: .12em; }\n.wv-section-head h2 { display: flex; align-items: center; gap: 8px; margin: 3px 0 0; font-size: 17px; font-weight: 660; letter-spacing: -.02em; }\n.wv-section-note { color: var(--wv-muted); font-size: 11.5px; }\n.wv-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n.wv-grid.three { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }\n.wv-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n.wv-stack { display: flex; flex-direction: column; gap: 14px; min-width: 0; }\n.wv-row { display: flex; align-items: center; gap: 10px; min-width: 0; }\n.wv-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.wv-wrap { flex-wrap: wrap; }\n.wv-grow { flex: 1; min-width: 0; }\n.wv-muted { color: var(--wv-muted); }\n.wv-small { font-size: 12px; }\n.wv-mono { font-family: ui-monospace, \"Cascadia Code\", \"Consolas\", monospace; font-size: 11.5px; letter-spacing: -.01em; }\n.wv-divider { height: 1px; background: var(--wv-hairline); margin: 4px 0; }\n\n.wv-service { display: flex; flex-direction: column; gap: 12px; padding: 16px; min-width: 0; }\n.wv-service-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }\n.wv-service-icon { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 9%, transparent); border: 1px solid color-mix(in srgb, var(--wv-accent) 17%, var(--wv-hairline)); }\n.wv-service:nth-child(2) .wv-service-icon { color: var(--wv-accent2); background: color-mix(in srgb, var(--wv-accent2) 9%, transparent); border-color: color-mix(in srgb, var(--wv-accent2) 17%, var(--wv-hairline)); }\n.wv-service:nth-child(3) .wv-service-icon { color: var(--wv-success); background: color-mix(in srgb, var(--wv-success) 9%, transparent); border-color: color-mix(in srgb, var(--wv-success) 17%, var(--wv-hairline)); }\n.wv-service-name { margin: 1px 0 0; font-size: 13.5px; font-weight: 650; }\n.wv-service-desc { margin: 0; color: var(--wv-muted); font-size: 12px; line-height: 1.45; min-height: 30px; }\n.wv-service-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid var(--wv-hairline); }\n.wv-service-meta .wv-btn { padding-left: 0; padding-right: 0; min-height: 20px; }\n\n.wv-status { display: inline-flex; align-items: center; gap: 6px; padding: 2px 7px; border-radius: 999px; border: 1px solid transparent; font-size: 11px; font-weight: 600; white-space: nowrap; }\n.wv-status::before { content: \"\"; width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent); }\n.wv-status.online, .wv-status.sent { color: var(--wv-success); background: color-mix(in srgb, var(--wv-success) 9%, transparent); border-color: color-mix(in srgb, var(--wv-success) 20%, transparent); }\n.wv-status.busy, .wv-status.recording, .wv-status.sending, .wv-status.queued { color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 9%, transparent); border-color: color-mix(in srgb, var(--wv-accent) 20%, transparent); }\n.wv-status.warn, .wv-status.unknown, .wv-status.waiting, .wv-status.ready { color: var(--wv-warn); background: color-mix(in srgb, var(--wv-warn) 9%, transparent); border-color: color-mix(in srgb, var(--wv-warn) 20%, transparent); }\n.wv-status.error, .wv-status.failed, .wv-status.rejected { color: var(--wv-error); background: color-mix(in srgb, var(--wv-error) 9%, transparent); border-color: color-mix(in srgb, var(--wv-error) 20%, transparent); }\n.wv-status.idle, .wv-status.offline, .wv-status.disconnected, .wv-status.starting { color: var(--wv-muted); background: color-mix(in srgb, var(--wv-muted) 8%, transparent); border-color: color-mix(in srgb, var(--wv-muted) 16%, transparent); }\n.wv-status.starting { color: var(--wv-accent); }\n.wv-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }\n\n.wv-stat { display: flex; flex-direction: column; gap: 2px; padding: 13px 15px; }\n.wv-stat-label { color: var(--wv-muted); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }\n.wv-stat-value { font-size: 19px; font-weight: 680; letter-spacing: -.02em; }\n.wv-stat-sub { color: var(--wv-muted); font-size: 11.5px; }\n\n.wv-voicecard { display: flex; flex-direction: column; gap: 15px; padding: 19px; overflow: hidden; }\n.wv-voicecard::after { content: \"\"; position: absolute; width: 190px; height: 190px; right: -70px; top: -90px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--wv-accent) 13%, transparent), transparent 65%); pointer-events: none; }\n.wv-voice-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; position: relative; z-index: 1; }\n.wv-voicename { margin: 0; font-size: 20px; font-weight: 690; letter-spacing: -.02em; }\n.wv-voicesub { margin: 3px 0 0; color: var(--wv-muted); font-size: 12px; }\n.wv-voice-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 2px; }\n.wv-voicenote { margin: 0; padding: 9px 10px; border-left: 2px solid color-mix(in srgb, var(--wv-accent) 42%, transparent); border-radius: 0 7px 7px 0; background: color-mix(in srgb, var(--wv-accent) 5%, transparent); color: var(--wv-muted); font-size: 11.5px; line-height: 1.5; }\n.wv-metaitem { padding: 9px 10px; border-radius: 9px; background: color-mix(in srgb, var(--wv-layer1) 38%, transparent); border: 1px solid var(--wv-hairline); min-width: 0; }\n.wv-metaitem span { display: block; color: var(--wv-muted); font-size: 10.5px; letter-spacing: .03em; text-transform: uppercase; }\n.wv-metaitem strong { display: block; margin-top: 2px; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-wave-mini { height: 38px; display: flex; align-items: center; gap: 2px; overflow: hidden; opacity: .8; }\n.wv-wave-mini i { display: block; width: 3px; border-radius: 99px; background: linear-gradient(180deg, var(--wv-accent), var(--wv-accent2)); opacity: .7; }\n\n.wv-quick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; }\n.wv-quick-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 9px 0; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 70%, transparent); }\n.wv-quick-row:nth-child(odd) { padding-right: 16px; }\n.wv-quick-row:nth-child(even) { padding-left: 16px; border-left: 1px solid color-mix(in srgb, var(--wv-hairline) 70%, transparent); }\n.wv-quick-row .wv-quicklabel { font-size: 12px; font-weight: 550; }\n.wv-quick-row .wv-quicksub { margin-top: 1px; color: var(--wv-muted); font-size: 11px; }\n.wv-quick-control { display: inline-flex; align-items: center; gap: 8px; flex: none; }\n.wv-switchstate { color: var(--wv-muted); font-size: 11px; white-space: nowrap; }\n\n.wv-switch { position: relative; flex: none; display: inline-flex; align-items: center; width: 36px; height: 20px; padding: 0; border: 1px solid var(--wv-hairline); border-radius: 999px; background: color-mix(in srgb, var(--wv-muted) 18%, transparent); transition: background .16s ease, border-color .16s ease, box-shadow .16s ease; }\n.wv-switch::after { content: \"\"; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px color-mix(in srgb, #000 24%, transparent); transition: transform .16s ease; }\n.wv-switch[aria-checked=\"true\"] { background: color-mix(in srgb, var(--wv-accent) 72%, transparent); border-color: color-mix(in srgb, var(--wv-accent) 60%, var(--wv-hairline)); }\n.wv-switch[aria-checked=\"true\"]::after { transform: translateX(16px); }\n.wv-switch:disabled { opacity: .42; }\n.wv-switch.saving { background: color-mix(in srgb, var(--wv-warn) 36%, transparent); }\n.wv-switch.saving::after { animation: wv-pulse 1s ease infinite; }\n@keyframes wv-pulse { 50% { opacity: .5; } }\n\n.wv-activity-list { display: flex; flex-direction: column; padding-right: 120px; }\n.wv-quick-foot { padding-right: 120px; }\n.wv-root[data-layout=\"narrow\"] .wv-activity-list, .wv-root[data-layout=\"narrow\"] .wv-quick-foot { padding-right: 0; }\n@media (max-width: 1200px) {\n  .wv-service { padding-right: 110px; }\n}\n@media (max-width: 1550px) {\n  .wv-quick { grid-template-columns: 1fr; padding-right: 120px; }\n  .wv-quick-row:nth-child(odd) { padding-right: 0; }\n  .wv-quick-row:nth-child(even) { padding-left: 0; border-left: 0; }\n}\n.wv-activity-row { display: grid; grid-template-columns: minmax(0, 1.5fr) 98px 84px 90px 20px; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 66%, transparent); min-width: 0; }\n.wv-activity-row:last-child { border-bottom: 0; }\n.wv-activity-main { min-width: 0; }\n.wv-activity-target { font-size: 12px; font-weight: 580; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-activity-sub { margin-top: 1px; color: var(--wv-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-activity-time { color: var(--wv-muted); font-size: 11.5px; }\n.wv-activity-chev { color: var(--wv-muted); display: grid; place-items: center; }\n.wv-activity-row:hover .wv-activity-chev { color: var(--wv-accent); }\n\n.wv-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 14px; border-bottom: 1px solid var(--wv-hairline); }\n.wv-search { position: relative; display: flex; align-items: center; min-width: 190px; flex: 1; max-width: 320px; }\n.wv-search svg { position: absolute; left: 9px; color: var(--wv-muted); pointer-events: none; }\n.wv-input, .wv-select, .wv-textarea { width: 100%; min-height: 30px; padding: 5px 9px; border-radius: 8px; border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-bg) 50%, transparent); color: var(--wv-text); outline: none; transition: border-color .15s ease, background .15s ease, box-shadow .15s ease; }\n.wv-input::placeholder, .wv-textarea::placeholder { color: color-mix(in srgb, var(--wv-muted) 76%, transparent); }\n.wv-input:focus, .wv-select:focus, .wv-textarea:focus { border-color: color-mix(in srgb, var(--wv-accent) 55%, var(--wv-hairline)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--wv-accent) 10%, transparent); }\n.wv-input.withicon { padding-left: 29px; }\n.wv-textarea { resize: vertical; min-height: 76px; line-height: 1.55; }\n.wv-select { appearance: none; padding-right: 26px; background-image: linear-gradient(45deg, transparent 50%, var(--wv-muted) 50%), linear-gradient(135deg, var(--wv-muted) 50%, transparent 50%); background-position: calc(100% - 13px) 13px, calc(100% - 9px) 13px; background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }\n.wv-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }\n.wv-field > label, .wv-label { color: color-mix(in srgb, var(--wv-text) 78%, var(--wv-muted)); font-size: 12px; font-weight: 560; }\n.wv-hint { color: var(--wv-muted); font-size: 11px; line-height: 1.45; }\n.wv-error { color: var(--wv-error); font-size: 11px; }\n.wv-input.invalid, .wv-select.invalid, .wv-textarea.invalid { border-color: color-mix(in srgb, var(--wv-error) 55%, var(--wv-hairline)); }\n\n.wv-settings-group { display: flex; flex-direction: column; }\n.wv-setting { display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 13px 0; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 68%, transparent); min-width: 0; }\n.wv-setting:last-child { border-bottom: 0; }\n.wv-setting-copy { min-width: 0; }\n.wv-setting-copy strong { display: block; font-size: 13px; font-weight: 570; }\n.wv-setting-copy p { margin: 2px 0 0; color: var(--wv-muted); font-size: 11.5px; line-height: 1.45; }\n.wv-setting-control { flex: none; display: flex; align-items: center; gap: 8px; }\n.wv-setting-control .wv-select { min-width: 150px; }\n.wv-setting-control .wv-input { width: 110px; text-align: right; }\n\n.wv-slider { --p: 50%; width: 170px; accent-color: var(--wv-accent); height: 18px; cursor: pointer; }\n.wv-slider:disabled { cursor: default; opacity: .45; }\n.wv-rangeval { min-width: 44px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--wv-muted); }\n\n.wv-badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 5px; font-size: 10.5px; font-weight: 620; letter-spacing: .02em; white-space: nowrap; }\n.wv-badge.demo { color: var(--wv-warn); background: color-mix(in srgb, var(--wv-warn) 9%, transparent); border: 1px solid color-mix(in srgb, var(--wv-warn) 18%, transparent); }\n.wv-badge.backend { color: var(--wv-success); background: color-mix(in srgb, var(--wv-success) 8%, transparent); border: 1px solid color-mix(in srgb, var(--wv-success) 18%, transparent); }\n.wv-badge.wait { color: var(--wv-muted); background: color-mix(in srgb, var(--wv-muted) 8%, transparent); border: 1px solid color-mix(in srgb, var(--wv-muted) 14%, transparent); }\n.wv-badge.accent { color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 9%, transparent); border: 1px solid color-mix(in srgb, var(--wv-accent) 18%, transparent); }\n\n.wv-notice { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border-radius: var(--wv-r-sm); border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-layer2) 34%, transparent); color: var(--wv-muted); font-size: 11.5px; line-height: 1.5; }\n.wv-notice svg { flex: none; margin-top: 1px; color: var(--wv-accent); }\n.wv-notice.warn { color: color-mix(in srgb, var(--wv-warn) 72%, var(--wv-text)); background: color-mix(in srgb, var(--wv-warn) 7%, transparent); border-color: color-mix(in srgb, var(--wv-warn) 16%, transparent); }\n.wv-notice.warn svg { color: var(--wv-warn); }\n.wv-notice.error { color: color-mix(in srgb, var(--wv-error) 72%, var(--wv-text)); background: color-mix(in srgb, var(--wv-error) 7%, transparent); border-color: color-mix(in srgb, var(--wv-error) 16%, transparent); }\n.wv-notice.error svg { color: var(--wv-error); }\n\n.wv-perm-row { display: grid; grid-template-columns: 34px minmax(0, 1.5fr) 110px minmax(110px, .9fr) 92px 32px; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 66%, transparent); min-width: 0; }\n.wv-perm-row:last-child { border-bottom: 0; }\n.wv-avatar { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--wv-accent) 16%, var(--wv-hairline)); font-size: 12px; font-weight: 650; }\n.wv-perm-name { font-size: 13px; font-weight: 580; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-perm-id { margin-top: 1px; color: var(--wv-muted); font-size: 10.5px; font-family: ui-monospace, Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-perm-col { font-size: 11.5px; color: var(--wv-muted); min-width: 0; }\n.wv-perm-col strong { display: block; color: color-mix(in srgb, var(--wv-text) 78%, var(--wv-muted)); font-size: 11.5px; font-weight: 560; }\n.wv-more-wrap { position: relative; justify-self: end; }\n.wv-menu { position: absolute; z-index: 30; right: 0; top: calc(100% + 5px); min-width: 190px; padding: 5px; border-radius: 11px; border: 1px solid var(--wv-hairline); background: var(--wv-glass-strong); -webkit-backdrop-filter: blur(20px) saturate(1.1); backdrop-filter: blur(20px) saturate(1.1); box-shadow: var(--wv-shadow); }\n.wv-menu button { display: block; width: 100%; padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--wv-text); text-align: left; font-size: 12px; }\n.wv-menu button:hover { background: color-mix(in srgb, var(--wv-layer2) 60%, transparent); }\n.wv-menu .danger { color: var(--wv-error); }\n\n.wv-group-row { display: grid; grid-template-columns: minmax(0, 1.5fr) 130px 90px 85px 32px; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 66%, transparent); }\n.wv-group-row:last-child { border-bottom: 0; }\n.wv-group-name { font-size: 13px; font-weight: 580; }\n.wv-group-id { color: var(--wv-muted); font-size: 10.5px; font-family: ui-monospace, Consolas, monospace; }\n.wv-checkline { display: flex; align-items: center; gap: 6px; color: var(--wv-muted); font-size: 11px; }\n\n.wv-studio { display: grid; grid-template-columns: minmax(290px, .8fr) minmax(0, 1.2fr); gap: 14px; align-items: start; }\n.wv-studio-profile { position: sticky; top: 0; overflow: hidden; }\n.wv-studio-hero { position: relative; padding: 22px 20px 16px; background: linear-gradient(145deg, color-mix(in srgb, var(--wv-accent) 12%, transparent), color-mix(in srgb, var(--wv-accent2) 8%, transparent) 55%, transparent); border-bottom: 1px solid var(--wv-hairline); overflow: hidden; }\n.wv-studio-hero::after { content: \"\"; position: absolute; width: 210px; height: 210px; right: -85px; top: -105px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--wv-accent) 18%, transparent); box-shadow: 0 0 0 24px color-mix(in srgb, var(--wv-accent) 3%, transparent), 0 0 0 48px color-mix(in srgb, var(--wv-accent) 2%, transparent); }\n.wv-studio-title { position: relative; z-index: 1; }\n.wv-studio-title h2 { margin: 0; font-size: 21px; font-weight: 690; letter-spacing: -.02em; }\n.wv-studio-title p { margin: 4px 0 0; color: var(--wv-muted); font-size: 12px; }\n.wv-studio-wave { position: relative; z-index: 1; height: 84px; margin: 18px 0 4px; display: flex; align-items: center; gap: 3px; }\n.wv-studio-wave i { flex: 1; min-width: 1px; border-radius: 99px; background: linear-gradient(180deg, color-mix(in srgb, var(--wv-accent) 88%, #fff 12%), color-mix(in srgb, var(--wv-accent2) 70%, transparent)); opacity: .72; }\n.wv-studio-meta { padding: 14px 20px 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }\n.wv-preview { display: flex; flex-direction: column; gap: 13px; }\n.wv-preview-text { min-height: 90px; }\n.wv-preview-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }\n.wv-player { display: flex; flex-direction: column; gap: 9px; padding: 12px; border-radius: var(--wv-r-sm); border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-bg) 34%, transparent); }\n.wv-player-wave { height: 58px; display: flex; align-items: center; gap: 2px; overflow: hidden; position: relative; }\n.wv-player-wave i { flex: 1; min-width: 1px; border-radius: 99px; background: color-mix(in srgb, var(--wv-accent) 36%, transparent); }\n.wv-player-wave i.on { background: linear-gradient(180deg, var(--wv-accent), var(--wv-accent2)); }\n.wv-player-wave .playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--wv-accent); left: 0; opacity: .6; }\n.wv-player-controls { display: flex; align-items: center; gap: 9px; }\n.wv-progress { flex: 1; height: 4px; border-radius: 99px; background: color-mix(in srgb, var(--wv-muted) 16%, transparent); overflow: hidden; }\n.wv-progress i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, var(--wv-accent), var(--wv-accent2)); }\n.wv-time { color: var(--wv-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }\n.wv-volume { display: flex; align-items: center; gap: 7px; color: var(--wv-muted); }\n.wv-volume input { width: 90px; accent-color: var(--wv-accent); }\n\n.wv-versions { display: flex; flex-direction: column; gap: 7px; }\n.wv-version { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 11px; border-radius: 9px; border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-layer1) 30%, transparent); }\n.wv-version.on { border-color: color-mix(in srgb, var(--wv-accent) 22%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-accent) 7%, transparent); }\n.wv-version strong { font-size: 12px; font-weight: 620; }\n.wv-version span { display: block; margin-top: 1px; color: var(--wv-muted); font-size: 10.5px; }\n\n.wv-emotions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }\n.wv-emotion { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; min-height: 120px; padding: 14px; border-radius: var(--wv-r-md); border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-layer1) 34%, transparent); text-align: left; transition: border-color .16s ease, background .16s ease, transform .16s ease; }\n.wv-emotion:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--wv-accent) 28%, var(--wv-hairline)); }\n.wv-emotion[aria-pressed=\"true\"] { border-color: color-mix(in srgb, var(--wv-accent) 45%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-accent) 8%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--wv-accent) 10%, transparent); }\n.wv-emotion-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 9%, transparent); border: 1px solid color-mix(in srgb, var(--wv-accent) 15%, var(--wv-hairline)); }\n.wv-emotion:nth-child(2) .wv-emotion-icon { color: #d18a9f; background: color-mix(in srgb, #d18a9f 10%, transparent); }\n.wv-emotion:nth-child(3) .wv-emotion-icon { color: var(--wv-warn); background: color-mix(in srgb, var(--wv-warn) 9%, transparent); }\n.wv-emotion:nth-child(4) .wv-emotion-icon { color: #c58bd8; background: color-mix(in srgb, #c58bd8 9%, transparent); }\n.wv-emotion:nth-child(5) .wv-emotion-icon { color: var(--wv-success); background: color-mix(in srgb, var(--wv-success) 9%, transparent); }\n.wv-emotion:nth-child(6) .wv-emotion-icon { color: var(--wv-muted); background: color-mix(in srgb, var(--wv-muted) 9%, transparent); }\n.wv-emotion strong { font-size: 13px; font-weight: 620; }\n.wv-emotion span { color: var(--wv-muted); font-size: 11px; line-height: 1.45; }\n\n.wv-filters { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }\n.wv-table { width: 100%; border-collapse: collapse; font-size: 12px; }\n.wv-table th { padding: 8px 10px; text-align: left; color: var(--wv-muted); font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; border-bottom: 1px solid var(--wv-hairline); white-space: nowrap; }\n.wv-table td { padding: 10px; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 62%, transparent); vertical-align: middle; }\n.wv-table tbody tr { cursor: pointer; }\n.wv-table tbody tr:hover { background: color-mix(in srgb, var(--wv-layer2) 30%, transparent); }\n.wv-table tbody tr:last-child td { border-bottom: 0; }\n.wv-table .id { color: var(--wv-muted); font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; }\n.wv-table .num { font-variant-numeric: tabular-nums; white-space: nowrap; }\n\n.wv-adv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }\n.wv-kv { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px 14px; align-items: center; }\n.wv-kv dt { color: var(--wv-muted); font-size: 11.5px; }\n.wv-kv dd { margin: 0; font-size: 12px; min-width: 0; overflow-wrap: anywhere; }\n.wv-code { padding: 2px 6px; border-radius: 5px; border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-bg) 40%, transparent); font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; }\n.wv-diag { margin: 0; padding: 12px; max-height: 220px; overflow: auto; border-radius: 9px; border: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-bg) 45%, transparent); color: var(--wv-muted); font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; white-space: pre-wrap; }\n\n.wv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 150px; padding: 24px; text-align: center; border: 1px dashed color-mix(in srgb, var(--wv-border-strong) 54%, transparent); border-radius: var(--wv-r-md); color: var(--wv-muted); }\n.wv-empty-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 11px; color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 8%, transparent); }\n.wv-empty strong { color: color-mix(in srgb, var(--wv-text) 82%, var(--wv-muted)); font-size: 13px; }\n.wv-empty p { margin: 0; max-width: 380px; font-size: 11.5px; line-height: 1.5; }\n\n.wv-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 22px; background: color-mix(in srgb, var(--wv-bg) 42%, transparent); -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px); }\n.wv-dialog { width: min(560px, calc(100vw - 32px)); max-height: min(86vh, 760px); display: flex; flex-direction: column; border-radius: var(--wv-r-xl); border: 1px solid color-mix(in srgb, var(--wv-border-strong) 72%, var(--wv-hairline)); background: var(--wv-glass-strong); -webkit-backdrop-filter: blur(26px) saturate(1.12); backdrop-filter: blur(26px) saturate(1.12); box-shadow: 0 28px 80px color-mix(in srgb, var(--wv-text) 22%, transparent); overflow: hidden; }\n.wv-dialog.lg { width: min(900px, calc(100vw - 32px)); max-height: min(90vh, 860px); }\n\n/* First-run setup wizard and component manager */\n.wv-setup-banner { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 12px; margin-top: 12px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--wv-accent) 20%, var(--wv-hairline)); border-radius: var(--wv-r-md); background: linear-gradient(120deg, color-mix(in srgb, var(--wv-accent) 8%, var(--wv-card-base)), color-mix(in srgb, var(--wv-accent2) 5%, var(--wv-card-base))); }\n.wv-setup-banner-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--wv-accent) 18%, var(--wv-hairline)); }\n.wv-setup-banner-copy strong { display: block; font-size: 12.5px; }\n.wv-setup-banner-copy p { margin: 2px 0 0; color: var(--wv-muted); font-size: 11px; line-height: 1.45; }\n.wv-setup-banner-actions { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }\n\n.wv-setup-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; padding: 4px; margin: -4px 0 16px; border: 1px solid var(--wv-hairline); border-radius: 10px; background: color-mix(in srgb, var(--wv-bg) 34%, transparent); }\n.wv-setup-step { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 8px; border: 0; border-radius: 7px; background: transparent; color: var(--wv-muted); text-align: left; cursor: pointer; }\n.wv-setup-step:hover:not(:disabled) { background: color-mix(in srgb, var(--wv-layer2) 35%, transparent); }\n.wv-setup-step.active { background: color-mix(in srgb, var(--wv-accent) 10%, transparent); color: var(--wv-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--wv-accent) 25%, transparent); }\n.wv-setup-step.done .wv-setup-step-num { color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 12%, transparent); }\n.wv-setup-step:disabled { cursor: default; opacity: .55; }\n.wv-setup-step-num { flex: none; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font-size: 10px; font-weight: 700; color: var(--wv-muted); background: color-mix(in srgb, var(--wv-layer2) 64%, transparent); }\n.wv-setup-step.active .wv-setup-step-num { color: #fff; background: var(--wv-accent); }\n.wv-setup-step-copy { min-width: 0; }\n.wv-setup-step-copy strong { display: block; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.wv-setup-step-copy small { display: block; margin-top: 1px; font-size: 9.5px; color: var(--wv-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\n.wv-setup-lead { display: flex; gap: 11px; align-items: flex-start; margin-bottom: 14px; }\n.wv-setup-lead-icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--wv-accent) 18%, var(--wv-hairline)); }\n.wv-setup-lead-icon.ok { color: var(--wv-online, #61d6a2); background: color-mix(in srgb, #61d6a2 10%, transparent); border-color: color-mix(in srgb, #61d6a2 24%, var(--wv-hairline)); }\n.wv-setup-lead h3 { margin: 1px 0 3px; font-size: 16px; font-weight: 650; }\n.wv-setup-lead p { margin: 2px 0 0; color: var(--wv-muted); font-size: 11.5px; line-height: 1.55; }\n.wv-setup-lead .wv-badge { margin-top: 6px; }\n.wv-setup-statusline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }\n.wv-setup-statuslabel { font-size: 11px; font-weight: 650; color: var(--wv-text); }\n.wv-setup-pill { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--wv-hairline); font-size: 9.5px; line-height: 1.5; color: var(--wv-muted); background: color-mix(in srgb, var(--wv-layer2) 35%, transparent); white-space: nowrap; }\n.wv-setup-pill.online { color: #65d6a5; border-color: color-mix(in srgb, #65d6a5 30%, var(--wv-hairline)); background: color-mix(in srgb, #65d6a5 8%, transparent); }\n.wv-setup-pill.starting { color: #e8c06b; border-color: color-mix(in srgb, #e8c06b 28%, var(--wv-hairline)); }\n.wv-setup-pill.error { color: #f19999; border-color: color-mix(in srgb, #f19999 28%, var(--wv-hairline)); }\n.wv-setup-pill.demo { color: var(--wv-accent); border-color: color-mix(in srgb, var(--wv-accent) 25%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-accent) 7%, transparent); }\n.wv-setup-evidence { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin: -4px 0 10px; color: var(--wv-muted); font-size: 9.5px; line-height: 1.45; }\n.wv-setup-evidence svg { flex: none; color: var(--wv-accent); opacity: .8; }\n.wv-setup-evidence-sep { opacity: .5; }\n\n.wv-setup-checks { display: grid; grid-template-columns: 1fr; gap: 0; border: 1px solid var(--wv-hairline); border-radius: 9px; overflow: hidden; background: color-mix(in srgb, var(--wv-bg) 26%, transparent); }\n.wv-setup-checks.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n.wv-setup-check { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 62%, transparent); font-size: 11px; }\n.wv-setup-check:last-child { border-bottom: 0; }\n.wv-setup-checks.two .wv-setup-check:nth-last-child(2) { border-bottom: 0; }\n.wv-setup-check-icon { display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; color: var(--wv-muted); background: color-mix(in srgb, var(--wv-layer2) 48%, transparent); }\n.wv-setup-check-icon.ok, .wv-setup-check-icon.pass { color: #61d6a2; background: color-mix(in srgb, #61d6a2 10%, transparent); }\n.wv-setup-check-icon.wait, .wv-setup-check-icon.unknown { color: #e7bf69; background: color-mix(in srgb, #e7bf69 10%, transparent); }\n.wv-setup-check-icon.fail { color: #f19999; background: color-mix(in srgb, #f19999 10%, transparent); }\n.wv-setup-check-label { min-width: 0; color: var(--wv-text); }\n.wv-setup-check-value { color: var(--wv-muted); font-size: 10.5px; white-space: nowrap; }\n\n.wv-setup-callout { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0; padding: 10px 11px; border: 1px solid var(--wv-hairline); border-radius: 9px; color: var(--wv-muted); font-size: 11px; line-height: 1.5; background: color-mix(in srgb, var(--wv-layer2) 26%, transparent); }\n.wv-setup-callout svg { flex: none; margin-top: 2px; }\n.wv-setup-callout strong { display: block; color: var(--wv-text); font-size: 11.5px; margin-bottom: 2px; }\n.wv-setup-callout p { margin: 2px 0 0; }\n.wv-setup-callout.warn { border-color: color-mix(in srgb, #e8c06b 22%, var(--wv-hairline)); background: color-mix(in srgb, #e8c06b 5%, transparent); }\n.wv-setup-callout.warn svg { color: #e8c06b; }\n.wv-setup-callout.ok { border-color: color-mix(in srgb, #61d6a2 22%, var(--wv-hairline)); background: color-mix(in srgb, #61d6a2 5%, transparent); }\n.wv-setup-callout.ok svg { color: #61d6a2; }\n.wv-setup-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }\n.wv-setup-blocked { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 32px 18px; text-align: center; border: 1px dashed var(--wv-border-strong); border-radius: 12px; background: color-mix(in srgb, var(--wv-bg) 28%, transparent); }\n.wv-setup-blocked-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; color: var(--wv-accent); background: color-mix(in srgb, var(--wv-accent) 9%, transparent); }\n.wv-setup-blocked h3 { margin: 3px 0 0; font-size: 14px; }\n.wv-setup-blocked p { max-width: 460px; margin: 0 0 5px; color: var(--wv-muted); font-size: 11.5px; line-height: 1.55; }\n.wv-setup-plan { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--wv-hairline); border-radius: 9px; background: color-mix(in srgb, var(--wv-bg) 30%, transparent); }\n.wv-setup-plan-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; }\n.wv-setup-plan ol { margin: 8px 0 0; padding-left: 18px; color: var(--wv-muted); font-size: 11px; line-height: 1.75; }\n.wv-setup-plan li::marker { color: var(--wv-accent); }\n.wv-setup-credentials { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }\n.wv-setup-field { display: grid; gap: 5px; }\n.wv-setup-field label { color: var(--wv-muted); font-size: 10.5px; }\n.wv-setup-field .wv-input { width: 100%; }\n.wv-setup-footnote { color: var(--wv-muted); font-size: 10px; }\n.wv-spacer { flex: 1; }\n.wv-setup-demo-strip { display: flex; align-items: center; gap: 6px; margin-top: 12px; padding-top: 9px; border-top: 1px solid var(--wv-hairline); color: var(--wv-muted); font-size: 10px; }\n.wv-setup-demo-strip svg { color: var(--wv-accent); }\n\n.wv-provider-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }\n.wv-provider-card { display: block; width: 100%; min-height: 120px; padding: 11px; border: 1px solid var(--wv-hairline); border-radius: 9px; background: color-mix(in srgb, var(--wv-bg) 34%, transparent); color: var(--wv-text); text-align: left; cursor: pointer; }\n.wv-provider-card:hover:not(.disabled), .wv-provider-card.selected { border-color: color-mix(in srgb, var(--wv-accent) 34%, var(--wv-hairline)); background: color-mix(in srgb, var(--wv-accent) 7%, transparent); }\n.wv-provider-card.disabled { cursor: default; opacity: .65; }\n.wv-provider-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }\n.wv-provider-head strong { font-size: 12px; }\n.wv-provider-state { color: var(--wv-muted); font-size: 9.5px; white-space: nowrap; }\n.wv-provider-card p { margin: 6px 0; color: var(--wv-muted); font-size: 10.5px; line-height: 1.5; }\n.wv-provider-meta { display: block; color: var(--wv-muted); font-size: 9.5px; line-height: 1.45; }\n.wv-component-list { display: grid; gap: 0; margin-top: 12px; border: 1px solid var(--wv-hairline); border-radius: 9px; overflow: hidden; }\n.wv-component-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 10px 11px; border-bottom: 1px solid color-mix(in srgb, var(--wv-hairline) 62%, transparent); }\n.wv-component-row:last-child { border-bottom: 0; }\n.wv-component-main strong { display: block; font-size: 11.5px; }\n.wv-component-main p { margin: 2px 0 0; color: var(--wv-muted); font-size: 10.5px; }\n.wv-component-detail { color: var(--wv-muted); font-size: 10px; white-space: nowrap; }\n\n@media (max-width: 760px) {\n  .wv-setup-banner { grid-template-columns: 32px minmax(0, 1fr); }\n  .wv-setup-banner-actions { grid-column: 1 / -1; justify-content: flex-start; }\n  .wv-setup-steps { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n  .wv-setup-step { padding: 6px; }\n  .wv-setup-step-copy small { display: none; }\n  .wv-setup-checks.two, .wv-provider-grid, .wv-setup-credentials { grid-template-columns: 1fr; }\n  .wv-provider-card { min-height: 0; }\n  .wv-component-row { grid-template-columns: minmax(0, 1fr) auto; }\n  .wv-component-detail { display: none; }\n}\n\n.wv-dialog.sm { width: min(410px, calc(100vw - 32px)); }\n.wv-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 18px 20px 14px; border-bottom: 1px solid var(--wv-hairline); }\n.wv-dialog-head h2 { margin: 0; font-size: 16px; font-weight: 650; }\n.wv-dialog-head p { margin: 3px 0 0; color: var(--wv-muted); font-size: 11.5px; }\n.wv-dialog-body { padding: 16px 20px; overflow-y: auto; min-height: 0; }\n.wv-dialog-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--wv-hairline); background: color-mix(in srgb, var(--wv-layer1) 18%, transparent); }\n.wv-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }\n.wv-form-grid .full { grid-column: 1 / -1; }\n\n.wv-toast { position: fixed; z-index: 1100; right: 24px; bottom: 24px; display: flex; align-items: flex-start; gap: 9px; max-width: min(390px, calc(100vw - 32px)); padding: 10px 12px; border-radius: 11px; border: 1px solid var(--wv-hairline); background: var(--wv-glass-strong); -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px); box-shadow: var(--wv-shadow); color: var(--wv-text); font-size: 12px; line-height: 1.45; animation: wv-toastin .18s ease both; }\n.wv-toast.success { border-color: color-mix(in srgb, var(--wv-success) 25%, var(--wv-hairline)); }\n.wv-toast.success svg { color: var(--wv-success); }\n.wv-toast.error { border-color: color-mix(in srgb, var(--wv-error) 25%, var(--wv-hairline)); }\n.wv-toast.error svg { color: var(--wv-error); }\n.wv-toast svg { flex: none; margin-top: 1px; }\n@keyframes wv-toastin { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }\n\n.wv-tip { display: inline-grid; place-items: center; width: 14px; height: 14px; margin-left: 4px; border-radius: 50%; border: 1px solid var(--wv-hairline); color: var(--wv-muted); font-size: 9px; cursor: help; vertical-align: 1px; }\n.wv-tip:hover { color: var(--wv-accent); border-color: color-mix(in srgb, var(--wv-accent) 35%, var(--wv-hairline)); }\n.wv-tip .wv-tiptext { display: none; }\n.wv-tip:hover .wv-tiptext { display: block; position: absolute; z-index: 50; margin-top: 26px; margin-left: -150px; width: 220px; padding: 7px 9px; border-radius: 7px; border: 1px solid var(--wv-hairline); background: var(--wv-glass-strong); box-shadow: var(--wv-shadow); color: var(--wv-text); font-size: 11px; font-weight: 400; line-height: 1.45; text-align: left; }\n\n.wv-root[data-layout=\"compact\"], .wv-root[data-layout=\"narrow\"] { --wv-frame-inset: 12px; }\n.wv-root[data-layout=\"compact\"] .wv-shell { grid-template-columns: 68px minmax(0, 1fr); }\n.wv-root[data-layout=\"compact\"] .wv-brand { justify-content: center; padding-left: 0; padding-right: 0; }\n.wv-root[data-layout=\"compact\"] .wv-brandtext, .wv-root[data-layout=\"compact\"] .wv-navlabel, .wv-root[data-layout=\"compact\"] .wv-navbadge { display: none; }\n.wv-root[data-layout=\"compact\"] .wv-navitem { justify-content: center; padding-left: 0; padding-right: 0; }\n.wv-root[data-layout=\"compact\"] .wv-navicon { width: 24px; height: 24px; }\n.wv-root[data-layout=\"compact\"] .wv-sidefoot { padding-left: 0; padding-right: 0; align-items: center; }\n.wv-root[data-layout=\"compact\"] .wv-sidefootrow { justify-content: center; font-size: 0; }\n.wv-root[data-layout=\"compact\"] .wv-sidefootrow .wv-live { font-size: 9px; }\n.wv-root[data-layout=\"compact\"] .wv-sidefootrow:last-child { display: none; }\n.wv-root[data-layout=\"compact\"] .wv-content { padding-left: 18px; padding-right: 18px; }\n.wv-root[data-layout=\"compact\"] .wv-switchstate { display: none; }\n.wv-root[data-layout=\"compact\"] .wv-hero { grid-template-columns: minmax(0, 1fr) 220px; }\n\n.wv-root[data-layout=\"narrow\"] .wv-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }\n.wv-root[data-layout=\"narrow\"] .wv-sidebar { flex-direction: row; align-items: center; gap: 8px; padding: 8px 10px; border-right: 0; border-bottom: 1px solid var(--wv-hairline); overflow: hidden; }\n.wv-root[data-layout=\"narrow\"] .wv-brand { flex: none; padding: 0; border: 0; }\n.wv-root[data-layout=\"narrow\"] .wv-brandmark { width: 30px; height: 30px; border-radius: 9px; }\n.wv-root[data-layout=\"narrow\"] .wv-brandtext, .wv-root[data-layout=\"narrow\"] .wv-sidefoot { display: none; }\n.wv-root[data-layout=\"narrow\"] .wv-nav { flex-direction: row; overflow-x: auto; overflow-y: hidden; padding: 2px; gap: 3px; scrollbar-width: none; }\n.wv-root[data-layout=\"narrow\"] .wv-nav::-webkit-scrollbar { display: none; }\n.wv-root[data-layout=\"narrow\"] .wv-navitem { width: auto; flex: none; min-height: 32px; padding: 5px 9px; gap: 6px; }\n.wv-root[data-layout=\"narrow\"] .wv-navlabel { display: block; font-size: 11.5px; }\n.wv-root[data-layout=\"narrow\"] .wv-navbadge { display: none; }\n.wv-root[data-layout=\"narrow\"] .wv-topbar { min-height: 46px; padding: 7px 16px; }\n.wv-root[data-layout=\"narrow\"] .wv-topmeta { display: none; }\n.wv-root[data-layout=\"narrow\"] .wv-content { padding: 16px 16px 92px; }\n.wv-root[data-layout=\"narrow\"] .wv-pagehead { align-items: flex-start; flex-direction: column; gap: 10px; }\n.wv-root[data-layout=\"narrow\"] .wv-pagehead-actions { justify-content: flex-start; }\n.wv-root[data-layout=\"narrow\"] .wv-hero { grid-template-columns: 1fr; padding: 20px; }\n.wv-root[data-layout=\"narrow\"] .wv-hero-art { min-height: 150px; }\n.wv-root[data-layout=\"narrow\"] .wv-grid.three, .wv-root[data-layout=\"narrow\"] .wv-grid.two, .wv-root[data-layout=\"narrow\"] .wv-grid.four { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"narrow\"] .wv-studio { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"narrow\"] .wv-studio-profile { position: static; }\n.wv-root[data-layout=\"narrow\"] .wv-emotions { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n.wv-root[data-layout=\"narrow\"] .wv-adv-grid { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"narrow\"] .wv-activity-row { grid-template-columns: minmax(0, 1fr) 86px 20px; }\n.wv-root[data-layout=\"narrow\"] .wv-activity-row .wv-hide-narrow { display: none; }\n.wv-root[data-layout=\"narrow\"] .wv-quick { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"narrow\"] .wv-quick-row:nth-child(even) { padding-left: 0; border-left: 0; }\n.wv-root[data-layout=\"narrow\"] .wv-quick-row:nth-child(odd) { padding-right: 0; }\n.wv-root[data-layout=\"narrow\"] .wv-perm-row { grid-template-columns: 30px minmax(0, 1fr) 86px 30px; }\n.wv-root[data-layout=\"narrow\"] .wv-perm-row .wv-perm-col.optional { display: none; }\n.wv-root[data-layout=\"narrow\"] .wv-group-row { grid-template-columns: minmax(0, 1fr) 82px 30px; }\n.wv-root[data-layout=\"narrow\"] .wv-group-row .wv-group-optional { display: none; }\n.wv-root[data-layout=\"narrow\"] .wv-form-grid { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"narrow\"] .wv-preview-controls { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"narrow\"] .wv-setting { align-items: flex-start; flex-direction: column; gap: 8px; }\n.wv-root[data-layout=\"narrow\"] .wv-setting-control { width: 100%; justify-content: flex-start; }\n.wv-root[data-layout=\"narrow\"] .wv-setting-control .wv-select { flex: 1; min-width: 0; }\n.wv-root[data-layout=\"narrow\"] .wv-tablewrap { overflow-x: auto; }\n.wv-root[data-layout=\"narrow\"] .wv-table { min-width: 680px; }\n\n.wv-root[data-layout=\"compact\"] .wv-emotions { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n.wv-root[data-layout=\"compact\"] .wv-studio { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"compact\"] .wv-studio-profile { position: static; }\n.wv-root[data-layout=\"compact\"] .wv-grid.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n.wv-root[data-layout=\"compact\"] .wv-grid.two { grid-template-columns: 1fr; }\n.wv-root[data-layout=\"compact\"] .wv-service { padding-right: 120px; }\n.wv-root[data-layout=\"compact\"] .wv-adv-grid { grid-template-columns: 1fr; }\n\n@media (prefers-reduced-motion: reduce) {\n  .wv-root *, .wv-root *::before, .wv-root *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }\n}\n\n/* Real config readout - read-only Core snapshot */\n.wv-config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }\n.wv-config-item { display: flex; flex-direction: column; gap: 3px; padding: 10px 11px; border: 1px solid var(--wv-hairline); border-radius: var(--wv-r-sm); background: color-mix(in srgb, var(--wv-layer2) 26%, transparent); min-width: 0; }\n.wv-config-item span { color: var(--wv-muted); font-size: 10.5px; }\n.wv-config-item strong { font-size: 12.5px; font-weight: 620; overflow-wrap: anywhere; }\n.wv-config-item small { color: var(--wv-muted); font-size: 10.5px; line-height: 1.45; overflow-wrap: anywhere; }\n.wv-config-foot { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--wv-hairline); color: var(--wv-muted); font-size: 10.5px; }\n.wv-config-warn { color: var(--wv-warn); }\n@media (max-width: 760px) { .wv-config-grid { grid-template-columns: 1fr; } }\n";

    const NAV = [
      { id: 'overview', label: '总览', en: 'Overview', icon: 'overview', hint: '一眼看清语音系统' },
      { id: 'settings', label: '语音设置', en: 'Voice', icon: 'settings', hint: '开关与生成参数' },
      { id: 'permissions', label: '权限管理', en: 'Access', icon: 'shield', hint: '私聊与群聊白名单' },
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
          h('div', { className: 'wv-sidefootrow' }, h('span', { className: 'wv-live' }, '演示模式'), h('strong', null, 'Mock')),
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
          h('span', { className: 'wv-demo', title: '所有服务状态、任务与参数均为前端演示数据，不代表真实生产状态。' }, '演示数据'),
          h('span', { className: 'wv-topmeta' }, '不读取/不写入生产配置'),
          h(IconButton, { icon: 'refresh', label: '刷新演示状态', onClick: () => notify('演示状态已刷新；未请求真实服务。', 'success') })))
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

    /* Pure browser-side setup status reader and scan gate.
 *
 * This module is injected into client.js by build.mjs and imported directly by tests.
 * It contains no shell, installer or component operation.
 */

function createSetupScanGate() {
  let sequence = 0
  return {
    begin() { return ++sequence },
    isCurrent(id) { return id === sequence },
    get current() { return sequence },
  }
}

function readBridgeSetupStatus(bridge, options = {}) {
  const timeoutMs = options.timeoutMs || 5000
  const now = options.now || (() => new Date().toISOString())
  if (!bridge || typeof bridge.getStatus !== 'function') {
    return Promise.resolve({
      checking: false, available: false, reason: 'core_not_connected', data: null, checkedAt: now(),
    })
  }

  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({
      checking: false, available: false, reason: 'core_timeout', data: null, checkedAt: now(),
    }), timeoutMs)
  })

  const request = Promise.resolve()
    .then(() => bridge.getStatus())
    .then((data) => {
      if (!data || typeof data !== 'object' || data.schemaVersion !== 1 || typeof data.completed !== 'boolean') {
        return { checking: false, available: false, reason: 'core_invalid_response', data: null, checkedAt: now() }
      }
      return { checking: false, available: true, reason: '', data, checkedAt: now() }
    })
    .catch((error) => ({
      checking: false,
      available: false,
      reason: 'core_error:' + String(error && error.message ? error.message : error).slice(0, 120),
      data: null,
      checkedAt: now(),
    }))

  const raced = Promise.race([request, timeout])
  raced.finally(() => clearTimeout(timer))
  return raced
}

/* Pure setup-view derivation shared by the browser wizard and behavior tests.
 *
 * IMPORTANT: null/undefined means unknown. Only an explicit boolean true/false becomes pass/fail.
 * A 401 health response is "reachable but not healthy", never "healthy".
 */

function stateOf(value) {
  return value === true ? 'pass' : value === false ? 'fail' : 'unknown'
}

function combine(values) {
  if (values.some((v) => v === false)) return 'fail'
  if (values.length > 0 && values.every((v) => v === true)) return 'pass'
  return 'unknown'
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null
}

function deriveSetupView(status) {
  const data = status && typeof status === 'object' ? status : {}
  const wa = data.wechatAgent && typeof data.wechatAgent === 'object' ? data.wechatAgent : {}
  const sender = data.sender && typeof data.sender === 'object' ? data.sender : {}
  const tts = data.tts && typeof data.tts === 'object' ? data.tts : {}
  const preview = tts.preview && typeof tts.preview === 'object' ? tts.preview : {}

  const installed = boolOrNull(sender.installed)
  const processRunning = boolOrNull(sender.processRunning)
  const senderState = sender.state || 'unknown'
  const installedState = installed === true
    ? 'pass'
    : installed === false
      ? (senderState === 'not_configured' ? 'unknown' : 'fail')
      : 'unknown'
  const processState = processRunning === true
    ? 'pass'
    : processRunning === false
      ? (senderState === 'not_configured' ? 'unknown' : 'fail')
      : 'unknown'
  let healthReachable = null
  if (sender.healthReachable === true || (typeof sender.healthStatus === 'number' && sender.healthStatus > 0) || sender.health === 'ok') {
    healthReachable = true
  } else if (!(senderState === 'not_configured' || senderState === 'not_installed' || sender.health == null)) {
    healthReachable = false
  }
  const healthy = boolOrNull(sender.healthy)
  const recoveryKnown = boolOrNull(sender.recoveryPending)
  const voiceKnown = boolOrNull(data.voiceEnabled)
  const recoveryState = recoveryKnown === false ? 'pass' : recoveryKnown === true ? 'fail' : 'unknown'
  const voiceState = typeof voiceKnown === 'boolean' ? 'pass' : 'unknown'

  const senderReady = combine([
    senderState === 'not_configured' ? null : installed,
    senderState === 'not_configured' ? null : processRunning,
    healthReachable,
    healthy,
  ])
  const wechatConnected = wa.state === 'not_configured'
    ? null
    : boolOrNull(wa.connected)
  const compatibility = wa.compatibility === 'compatible'
    ? 'pass'
    : wa.compatibility === 'incompatible'
      ? 'fail'
      : 'unknown'

  const checks = [
    { id: 'wechat', label: 'WeChatAgent 已连接', state: stateOf(wechatConnected) },
    { id: 'sender', label: '微信语音发送器已安装、进程存在、健康检查通过', state: senderReady },
    { id: 'tts', label: 'TTS Provider 已配置', state: stateOf(boolOrNull(tts.configured)) },
    { id: 'preview', label: '试听通过', state: stateOf(boolOrNull(preview.ok)) },
    { id: 'compatibility', label: '组件兼容', state: compatibility },
    { id: 'recovery', label: '没有待恢复音频设备状态', state: recoveryState },
    { id: 'voice-switch', label: '微信语音开关状态已确认', state: voiceState },
  ]
  const complete = data.completed === true
    && data.demo !== true
    && checks.every((check) => check.state === 'pass')

  const components = [
    {
      id: 'core', name: 'Whale Voice Core', desc: '安装状态、任务与 API 协调',
      state: 'connected', detail: data.core && data.core.version ? data.core.version : '已连接',
    },
    {
      id: 'wechatagent', name: 'WeChatAgent', desc: '微信平台必需依赖',
      state: wa.state || 'unknown', detail: wa.version || '未检测',
    },
    {
      id: 'sender', name: '微信语音发送器', desc: '独立 Voice Sender 组件',
      state: sender.state || 'unknown', detail: sender.version || '未检测',
      installed: installed === true, processRunning: processRunning === true,
      healthReachable, healthy,
    },
    {
      id: 'tts', name: 'TTS Provider', desc: '本地 / 云端 / 自定义',
      state: tts.configured === true ? 'installed' : (tts.state === 'ok' ? 'not_configured' : (tts.state || 'not_installed')),
      detail: tts.provider ? (tts.provider + (tts.configured === true ? '' : ' · 未配置')) : '未配置',
    },
  ]

  return {
    demo: data.demo === true,
    completed: data.completed === true,
    complete,
    checks,
    unknownChecks: checks.filter((check) => check.state === 'unknown').map((check) => check.id),
    failedChecks: checks.filter((check) => check.state === 'fail').map((check) => check.id),
    advance: {
      wechat: wechatConnected === true,
      sender: senderReady === 'pass',
      tts: tts.configured === true,
      finish: complete,
    },
    wechat: {
      installed: wa.state === 'not_configured' ? null : boolOrNull(wa.installed),
      installedState: wa.state === 'not_configured' ? 'unknown' : stateOf(boolOrNull(wa.installed)),
      processRunning: boolOrNull(wa.processRunning),
      connected: wechatConnected,
      connectedState: stateOf(wechatConnected),
      accountVerified: stateOf(boolOrNull(wa.accountVerified)),
      reader: wa.reader || 'unknown',
      bridge: wa.bridge || 'unknown',
      dsh: wa.dsh || 'unknown',
      compatibility,
      version: wa.version || null,
      wechatVersion: wa.wechatVersion || null,
      wechatVersionVerified: wa.wechatVersionVerified === true,
      observedAt: wa.observedAt || null,
      evidence: wa.evidence || null,
    },
    sender: {
      installed: installed === true,
      installedState,
      processRunning: processRunning === true,
      processState,
      healthReachable,
      healthReachableState: stateOf(healthReachable),
      healthy: healthy === true,
      healthyState: stateOf(healthy),
      healthState: sender.healthState || sender.health || 'unknown',
      healthStatus: sender.healthStatus == null ? null : sender.healthStatus,
      ready: senderReady,
      readyState: senderReady,
      recoveryPending: recoveryKnown,
      recoveryState,
      version: sender.version || null,
      observedAt: sender.observedAt || null,
      evidence: sender.evidence || null,
    },
    tts: {
      configured: tts.configured === true,
      configuredState: stateOf(boolOrNull(tts.configured)),
      provider: tts.provider || null,
      state: tts.state || 'unknown',
      model: tts.model || null,
      voice: tts.voice || null,
      previewOk: preview.ok === true,
      previewState: stateOf(boolOrNull(preview.ok)),
      observedAt: tts.observedAt || null,
      evidence: tts.evidence || null,
    },
    voice: {
      enabled: voiceKnown,
      state: voiceState,
      source: data.voiceStateSource || 'not_read',
    },
    components,
  }
}

function configBoolText(value, yes, no) {
  return value === true ? yes : value === false ? no : '未知'
}

function configApplicationText(state) {
  if (state === 'MISMATCH') return '配置不一致'
  if (state === 'SAVED') return '已保存，生效未确认'
  if (state === 'ACTIVE') return '已生效'
  if (state === 'PENDING_RELOAD') return '待重载生效'
  return '生效状态未知'
}

function deriveConfigView(config) {
  const c = config && typeof config === 'object' && config.schemaVersion === 1 && config.demo !== true ? config : null
  if (!c) {
    return {
      available: false,
      demo: false,
      observedAt: null,
      revision: null,
      application: { state: 'UNKNOWN', text: '配置未读取', saved: false, activeConfirmed: false },
      voice: { enabled: null, enabledText: '未知', activeText: '实际生效：未确认', mode: null, forGroupText: '未知', autoProbabilityText: '未知', defaultVoice: null, source: null, consistency: 'unknown', alternate: null },
      tts: { provider: null, model: null, voice: null, configured: null, configuredText: '未知', runtimeText: '服务状态未知', mismatchText: null },
      permissions: { privateCount: null, groupCount: null, detailAvailable: false, privateText: '未知', groupText: '未知', note: '未读取名单' },
      sender: { configAvailable: null, serviceVersion: null, workerVersion: null, runningText: '未知', healthText: '未知', consistency: 'unknown', recoveryText: '未知' },
      sources: [],
    }
  }
  const app = c.application && typeof c.application === 'object' ? c.application : {}
  const voice = c.voice && typeof c.voice === 'object' ? c.voice : {}
  const tts = c.tts && typeof c.tts === 'object' ? c.tts : {}
  const runtime = tts.runtime && typeof tts.runtime === 'object' ? tts.runtime : {}
  const permissions = c.permissions && typeof c.permissions === 'object' ? c.permissions : {}
  const sender = c.sender && typeof c.sender === 'object' ? c.sender : {}
  const alternate = voice.alternate && typeof voice.alternate === 'object' ? voice.alternate : null
  return {
    available: true,
    demo: c.demo === true,
    observedAt: c.observedAt || null,
    revision: c.configRevision || null,
    application: {
      state: app.state || 'UNKNOWN',
      text: configApplicationText(app.state),
      saved: app.saved === true,
      savedRevision: app.savedRevision || null,
      activeRevision: app.activeRevision || null,
      activeConfirmed: app.activeConfirmed === true,
      note: app.note || '保存值不等于实际生效值。',
    },
    voice: {
      enabled: typeof voice.enabled === 'boolean' ? voice.enabled : null,
      enabledText: configBoolText(voice.enabled, '已保存：开启', '已保存：关闭'),
      activeText: '实际生效：未确认',
      mode: typeof voice.mode === 'string' ? voice.mode : null,
      triggerMode: typeof voice.triggerMode === 'string' ? voice.triggerMode : null,
      forGroupText: configBoolText(voice.forGroup, '已保存：允许群聊自动', '已保存：不允许群聊自动'),
      autoProbabilityText: typeof voice.autoProbability === 'number' ? '已保存：' + voice.autoProbability + '%' : '未知',
      defaultVoice: voice.defaultVoice || null,
      source: voice.source || null,
      consistency: voice.consistency || 'unknown',
      alternate: alternate ? {
        source: alternate.source || null,
        enabledText: configBoolText(alternate.enabled, 'Worker：开启', 'Worker：关闭'),
        mode: alternate.mode || null,
        forGroup: typeof alternate.forGroup === 'boolean' ? alternate.forGroup : null,
      } : null,
    },
    tts: {
      provider: tts.provider || null,
      model: tts.model || null,
      voice: tts.voice || null,
      configured: typeof tts.configured === 'boolean' ? tts.configured : null,
      configuredText: configBoolText(tts.configured, '已保存 Provider', '未配置 Provider'),
      runtimeState: runtime.state || 'unknown',
      runtimeModel: runtime.model || null,
      runtimeVoice: runtime.voice || null,
      runtimeText: runtime.reachable === true ? '服务可达' : '服务不可达或未知',
      mismatch: tts.mismatch || null,
      mismatchText: tts.mismatch ? '配置与服务返回不一致：' + tts.mismatch : null,
      previewOk: runtime.preview === true,
    },
    permissions: {
      privateCount: Number.isFinite(permissions.privateCount) ? permissions.privateCount : null,
      groupCount: Number.isFinite(permissions.groupCount) ? permissions.groupCount : null,
      senderAllowedCount: Number.isFinite(permissions.senderAllowedCount) ? permissions.senderAllowedCount : null,
      detailAvailable: permissions.detailAvailable === true,
      privateText: Number.isFinite(permissions.privateCount) ? String(permissions.privateCount) : '未知',
      groupText: Number.isFinite(permissions.groupCount) ? String(permissions.groupCount) : '未知',
      note: permissions.note || '仅返回数量，不返回联系人/群聊名称。',
    },
    sender: {
      configAvailable: typeof sender.configAvailable === 'boolean' ? sender.configAvailable : null,
      serviceVersion: sender.serviceVersion || null,
      workerVersion: sender.workerVersion || null,
      runningText: configBoolText(sender.serviceRunning, '运行中', '未运行'),
      healthText: configBoolText(sender.healthReachable, '健康接口可达', '健康接口不可达/未知'),
      healthy: typeof sender.healthy === 'boolean' ? sender.healthy : null,
      consistency: sender.serviceWorkerConsistency || 'unknown',
      recoveryText: sender.recoveryPending === true ? '存在待恢复' : sender.recoveryPending === false ? '未发现' : '未知',
      allowListSource: sender.allowListSource || null,
    },
    sources: Array.isArray(c.sources) ? c.sources : [],
  }
}

function SettingRow({ title, desc, children, tip }) {
  return h('div', { className: 'wv-setting' },
    h('div', { className: 'wv-setting-copy' },
      h('strong', null, title, tip ? h(Tip, { text: tip }) : null),
      desc ? h('p', null, desc) : null),
    h('div', { className: 'wv-setting-control' }, children))
}

function ServiceCard({ service, onOpen }) {
  return h('article', { className: 'wv-card wv-service' },
    h('div', { className: 'wv-service-head' },
      h('div', { className: 'wv-row' },
        h('div', { className: 'wv-service-icon' }, h(Icon, { name: service.id === 'qwen' ? 'spark' : service.id === 'sender' ? 'wave' : 'chat', size: 17 })),
        h('div', null,
          h('div', { className: 'wv-row', style: { gap: 6 } },
            h('h3', { className: 'wv-service-name' }, service.name),
            h(Badge, { tone: 'demo' }, '演示')),
          h('div', { className: 'wv-muted', style: { fontSize: 10.5, marginTop: 1 } }, service.kind))),
      h(Status, { status: service.status })),
    h('p', { className: 'wv-service-desc' }, service.desc),
    h('div', { className: 'wv-service-meta' },
      h('span', { className: 'wv-muted', style: { fontSize: 10.5 } }, service.latency + ' · 只读'),
      h(Button, { variant: 'ghost', size: 'sm', onClick: () => onOpen(service) }, '详细信息', h(Icon, { name: 'chevron', size: 12 }))))
}

function ActivityMini({ activity, onOpen, last }) {
  return h('button', {
    type: 'button', onClick: () => onOpen(activity),
    className: 'wv-activity-row',
    style: { width: '100%', background: 'transparent', border: 'none', borderBottom: last ? '0' : undefined, textAlign: 'left', padding: '10px 0' },
  },
    h('div', { className: 'wv-activity-main' },
      h('div', { className: 'wv-activity-target' }, activity.target,
        h('span', { className: 'wv-muted', style: { fontWeight: 400, marginLeft: 6, fontSize: 11 } }, activity.kind === '群聊' ? '群聊' : '私聊')),
      h('div', { className: 'wv-activity-sub' }, activity.voice + ' · ' + activity.audio + (activity.error ? ' · ' + activity.error : ''))),
    h('span', { className: 'wv-activity-time wv-hide-narrow' }, activity.time),
    h('span', { className: 'wv-hide-narrow' }, h(Status, { status: activity.status })),
    h('span', { className: 'wv-activity-time' }, activity.synth),
    h('span', { className: 'wv-activity-chev' }, h(Icon, { name: 'chevron', size: 14 })))
}

function ConfigReadout({ setup }) {
  const config = setup && setup.available && setup.data ? setup.data.config : null
  const view = deriveConfigView(config)
  const sourceCount = view.sources.filter((source) => source.readable).length
  return h('section', { className: 'wv-card pad wv-config-readout', style: { marginBottom: 14 } },
    h('div', { className: 'wv-card-title' },
      h('div', null, h('h2', null, '真实配置 · 只读'),
        h('p', null, '来自 Core 的已保存值；不写入配置，也不把保存值冒充实际生效值。')),
      h('div', { className: 'wv-row' },
        h(Badge, { tone: view.available ? 'accent' : 'wait' }, view.available ? 'Core 已读取' : 'Core 未读取'),
        h(Badge, { tone: 'demo' }, '不写入'))),
    view.available ? h(React.Fragment, null,
      h('div', { className: 'wv-config-grid' },
        h('div', { className: 'wv-config-item' },
          h('span', null, '语音开关'), h('strong', null, view.voice.enabledText),
          h('small', null, view.voice.activeText)),
        h('div', { className: 'wv-config-item' },
          h('span', null, '模式 / 群聊'), h('strong', null, (view.voice.mode || '未知') + ' · ' + view.voice.forGroupText),
          h('small', null, '触发：' + (view.voice.triggerMode || '未知') + ' · 自动概率：' + view.voice.autoProbabilityText)),
        h('div', { className: 'wv-config-item' },
          h('span', null, '默认音色'), h('strong', null, view.voice.defaultVoice || '未知'),
          h('small', null, '来源：' + (view.voice.source || '未知'))),
        h('div', { className: 'wv-config-item' },
          h('span', null, 'TTS Provider'), h('strong', null, (view.tts.provider || '未知') + ' · ' + view.tts.configuredText),
          h('small', null, '已保存音色：' + (view.tts.voice || '未知') + ' · ' + view.tts.runtimeText)),
        h('div', { className: 'wv-config-item' },
          h('span', null, '服务返回'), h('strong', null, view.tts.runtimeModel || '未返回模型'),
          h('small', null, view.tts.mismatchText || '未发现配置与模型不一致')),
        h('div', { className: 'wv-config-item' },
          h('span', null, '权限数量'), h('strong', null, '私聊 ' + view.permissions.privateText + ' / 群聊 ' + view.permissions.groupText),
          h('small', null, '名单详情：' + (view.permissions.detailAvailable ? '可读取' : '未读取'))),
        h('div', { className: 'wv-config-item' },
          h('span', null, 'Voice Sender'), h('strong', null, view.sender.runningText + ' · ' + view.sender.healthText),
          h('small', null, '配置一致性：' + view.sender.consistency + ' · 恢复：' + view.sender.recoveryText)),
        h('div', { className: 'wv-config-item' },
          h('span', null, '保存 / 生效'), h('strong', null, view.application.text),
          h('small', null, 'Revision ' + (view.revision || '—') + ' · 生效未确认'))),
      h('div', { className: 'wv-config-foot' },
        h('span', null, '读取于 ' + (view.observedAt || '未知') + ' · 可读来源 ' + sourceCount + ' 个'),
        view.application.state === 'MISMATCH' ? h('span', { className: 'wv-config-warn' }, '配置来源不一致，不能合并为一个开关值。') : null))
      : h('div', { className: 'wv-notice warn' },
        h(Icon, { name: 'alert', size: 15 }),
        h('span', null, 'Core 配置尚未读取。这里不会用 Mock 配置填充真实值；请检查 Host 连接或 Core 配置。')))
}

function OverviewPage({ settings, setSetting, setPage, notify, openService, openActivity, setup, onSetup, onComponents }) {
  const stats = [
    { label: '服务', value: '2 / 3', sub: '演示在线 · 1 忙碌' },
    { label: '专属音色', value: '1', sub: 'whale-v1 · 已就绪' },
    { label: '今日语音', value: '12', sub: '演示任务 · 本地气泡' },
    { label: '队列', value: '0', sub: '串行队列 · 空闲' },
  ]
  return h(React.Fragment, null,
    h('section', { className: 'wv-hero' },
      h('div', { className: 'wv-hero-copy' },
        h('div', { className: 'wv-eyebrow' }, 'WHALE VOICE · 小鲸鱼语音中心'),
        h('h1', null, '小鲸鱼的声音，', h('span', null, '已经准备好了。')),
        h('p', null, 'Qwen3-TTS · whale-v1 · 私聊演示联系人。当前是前端演示环境，服务状态与参数均为 Mock，不写入生产配置。'),
        h('div', { className: 'wv-hero-chips' },
          h('span', { className: 'wv-chip accent' }, h('strong', null, 'whale-v1'), '专属音色'),
          h('span', { className: 'wv-chip' }, h('strong', null, '2 / 3'), '服务在线'),
          h('span', { className: 'wv-chip' }, h('strong', null, '演示联系人'), '唯一私聊目标'),
          h('span', { className: 'wv-chip' }, h('strong', null, 'Mock'), '演示数据')),
        h('div', { className: 'wv-hero-actions' },
          h(Button, { variant: 'primary', onClick: () => setPage('settings') }, h(Icon, { name: 'settings', size: 14 }), '进入语音设置'),
          h(Button, { onClick: () => setPage('studio') }, h(Icon, { name: 'wave', size: 14 }), '打开音色中心'))),
      h('div', { className: 'wv-hero-art' }, h(WhaleArt))),
    h(SetupBanner, { status: setup, onSetup, onComponents }),
    h(ConfigReadout, { setup }),
    h('div', { className: 'wv-grid four', style: { marginTop: 12 } },
      stats.map((s) => h('div', { key: s.label, className: 'wv-card wv-stat' },
        h('span', { className: 'wv-stat-label' }, s.label),
        h('strong', { className: 'wv-stat-value' }, s.value),
        h('span', { className: 'wv-stat-sub' }, s.sub)))),
    h('div', { style: { height: 18 } }),
    h('div', { className: 'wv-section-head' },
      h('div', null,
        h('span', { className: 'wv-section-kicker' }, 'SERVICE STATUS'),
        h('h2', null, '服务状态', h(Badge, { tone: 'demo' }, 'Mock'))),
      h('span', { className: 'wv-section-note' }, '只读演示，不请求真实服务')),
    h('div', { className: 'wv-grid three' }, MOCK_SERVICES.map((service) => h(ServiceCard, { key: service.id, service, onOpen: openService }))),
    h('div', { style: { height: 14 } }),
    h('div', { className: 'wv-grid two' },
      h('section', { className: 'wv-card wv-voicecard' },
        h('div', { className: 'wv-voice-top' },
          h('div', null,
            h('div', { className: 'wv-row' }, h('h2', { className: 'wv-voicename' }, 'whale-v1'), h(Badge, { tone: 'accent' }, '当前音色')),
            h('p', { className: 'wv-voicesub' }, '小鲸鱼专属声音 · Qwen3-TTS 1.7B Base')),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPage('studio') }, '详情', h(Icon, { name: 'chevron', size: 12 }))),
        h(MiniWave, null),
        h('div', { className: 'wv-voice-meta' },
          h('div', { className: 'wv-metaitem' }, h('span', null, '模型'), h('strong', null, 'Qwen3-TTS 1.7B Base')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '版本'), h('strong', null, 'whale-v1 · v1.0')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '参考音频'), h('strong', null, '已锁定 · 演示')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '状态'), h('strong', null, '已就绪 · 演示'))),
        h('p', { className: 'wv-voicenote' }, '参考音频已锁定。试听与真实合成将在语音服务接入后开放；本轮不会调用 Qwen。'),
        h('div', { className: 'wv-row wv-wrap', style: { marginTop: 2 } },
          h(Button, { onClick: () => setPage('studio') }, h(Icon, { name: 'wave', size: 14 }), '进入音色中心'),
          h(Button, { variant: 'ghost', onClick: () => notify('试听需要真实语音服务接入；本轮不会调用 Qwen。', 'info') }, h(Icon, { name: 'play', size: 13 }), '试听（未接入）'))),
      h('section', { className: 'wv-card pad' },
        h('div', { className: 'wv-card-title' },
          h('div', null, h('h2', null, '快捷设置'), h('p', null, '前端演示开关，不会写入生产配置')),
          h(Badge, { tone: 'demo' }, '演示状态')),
        h('div', { className: 'wv-quick' },
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '私聊语音'), h('div', { className: 'wv-quicksub' }, '只允许白名单私聊')),
            h('div', { className: 'wv-quick-control' }, h('span', { className: 'wv-switchstate' }, settings.private_enabled ? '演示开启' : '演示关闭'), h(Toggle, { checked: settings.private_enabled, onChange: (v) => { setSetting('private_enabled', v); notify('仅修改前端演示状态。', 'info') }, label: '私聊语音' }))),
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '群聊语音'), h('div', { className: 'wv-quicksub' }, '默认关闭 · 需真实授权')),
            h('div', { className: 'wv-quick-control' }, h('span', { className: 'wv-switchstate' }, settings.group_enabled ? '演示开启' : '演示关闭'), h(Toggle, { checked: settings.group_enabled, onChange: (v) => { setSetting('group_enabled', v); notify('群聊语音仍受真实白名单约束。', 'info') }, label: '群聊语音' }))),
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '仅明确请求'), h('div', { className: 'wv-quicksub' }, '不做自动语音')),
            h('div', { className: 'wv-quick-control' }, h('span', { className: 'wv-switchstate' }, settings.explicit_only ? '演示开启' : '演示关闭'), h(Toggle, { checked: settings.explicit_only, onChange: (v) => setSetting('explicit_only', v), label: '仅明确请求' }))),
          h('div', { className: 'wv-quick-row' },
            h('div', null, h('div', { className: 'wv-quicklabel' }, '游戏模式'), h('div', { className: 'wv-quicksub' }, '暂停任务 · 不抢焦点')),
            h('div', { className: 'wv-quick-control' }, h('span', { className: 'wv-switchstate' }, settings.game_no_focus ? '演示开启' : '演示关闭'), h(Toggle, { checked: settings.game_no_focus, onChange: (v) => setSetting('game_no_focus', v), label: '游戏模式' })))),
        h('div', { className: 'wv-between wv-quick-foot', style: { marginTop: 13, paddingTop: 11, borderTop: '1px solid var(--wv-hairline)' } },
          h('div', null, h('div', { className: 'wv-small wv-muted' }, '语音生成状态'), h('div', { className: 'wv-row', style: { gap: 7, marginTop: 3 } }, h(Status, { status: 'online', label: '就绪 · 演示' }), h('span', { className: 'wv-muted', style: { fontSize: 11 } }, 'Qwen 本地引擎'))),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPage('activity') }, '查看任务', h(Icon, { name: 'chevron', size: 12 }))))),
    h('div', { style: { height: 14 } }),
    h(Card, {
      title: '最近活动', desc: '演示任务记录 · 不读取真实聊天内容',
      actions: h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPage('activity') }, '全部任务', h(Icon, { name: 'chevron', size: 12 })),
    }, h('div', { className: 'wv-activity-list' },
      MOCK_ACTIVITIES.slice(0, 4).map((a, i) => h(ActivityMini, { key: a.id, activity: a, onOpen: openActivity, last: i === 3 })))))
}

function SettingsPage({ settings, setSetting, dirty, saveSettings, resetSettings, notify, setup }) {
  const num = (v) => Number(v)
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / SETTINGS',
      title: '语音设置',
      description: '日常使用的安全配置。所有修改只存在于当前前端演示状态，不会写入生产 JSON 或触发真实语音。',
      actions: h(React.Fragment, null,
        dirty ? h(Badge, { tone: 'demo' }, '有未保存修改') : h(Badge, { tone: 'backend' }, '已同步演示草稿'),
        h(Button, { onClick: resetSettings, disabled: !dirty }, '恢复默认'),
        h(Button, { variant: 'primary', onClick: saveSettings, disabled: !dirty }, h(Icon, { name: 'check', size: 14 }), '保存演示')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '演示模式：开关只改变当前页面状态。真实语音开关、白名单与 Bridge 配置均不会被修改。')),
    h(ConfigReadout, { setup }),
    h('div', { className: 'wv-grid two' },
      h(Card, { title: '基础控制', desc: '总开关与回复方式' },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '总语音开关', desc: '关闭时所有语音请求都会降级为文字。' },
            h(Toggle, { checked: settings.enabled, onChange: (v) => setSetting('enabled', v), label: '总语音开关' })),
          h(SettingRow, { title: '私聊语音', desc: '只对私聊白名单内联系人生效。' },
            h(Toggle, { checked: settings.private_enabled, onChange: (v) => setSetting('private_enabled', v), label: '私聊语音' })),
          h(SettingRow, { title: '群聊语音', desc: '需要真实群授权、@ 与明确语音意图。' },
            h(Toggle, { checked: settings.group_enabled, onChange: (v) => setSetting('group_enabled', v), label: '群聊语音' })),
          h(SettingRow, { title: '仅明确请求时发语音', desc: '推荐开启。避免普通聊天被自动转成语音。' },
            h(Toggle, { checked: settings.explicit_only, onChange: (v) => setSetting('explicit_only', v), label: '仅明确请求' })),
          h(SettingRow, { title: '默认回复方式', desc: '文字优先，或按意图自动选择。' },
            h('select', { className: 'wv-select', value: settings.explicit_only ? 'explicit' : 'auto', onChange: (e) => setSetting('explicit_only', e.target.value === 'explicit'), 'aria-label': '默认回复方式' },
              h('option', { value: 'explicit' }, '明确语音请求'),
              h('option', { value: 'auto' }, '自动判断（演示）'))),
          h(SettingRow, { title: '允许自动语音', desc: '当前仅演示；生产建议保持关闭。' },
            h(Toggle, { checked: settings.auto, onChange: (v) => { setSetting('auto', v); if (v) setSetting('auto_probability', 35) }, label: '允许自动语音' })),
          h(SettingRow, { title: '自动语音概率', desc: '仅在“允许自动语音”开启时可调。', tip: '真实生产配置中应保持 0；这里只是前端演示。' },
            h('input', { className: 'wv-slider', type: 'range', min: 0, max: 100, step: 5, value: settings.auto_probability, disabled: !settings.auto, onChange: (e) => setSetting('auto_probability', num(e.target.value)), 'aria-label': '自动语音概率' }),
            h('span', { className: 'wv-rangeval' }, settings.auto_probability + '%')),
          h(SettingRow, { title: '默认音色', desc: '当前仅 whale-v1 可用。' },
            h('select', { className: 'wv-select', value: settings.default_voice, onChange: (e) => setSetting('default_voice', e.target.value), 'aria-label': '默认音色' },
              h('option', { value: 'whale-v1' }, 'whale-v1 · 小鲸鱼专属'),
              h('option', { value: 'whale-v2', disabled: true }, 'whale-v2 · 未来版本'),
              h('option', { value: 'custom', disabled: true }, '自定义音色 · 未接入'))))),
      h('div', { className: 'wv-stack' },
        h(Card, { title: '生成参数', desc: '合成阶段约束，不包含微信发送耗时' },
          h('div', { className: 'wv-settings-group' },
            h(SettingRow, { title: '单次最大文本长度', desc: '超过后会截断或拒绝，取决于后端策略。', tip: '只限制进入 TTS 的文本长度，不影响历史聊天。' },
              h('input', { className: 'wv-slider', type: 'range', min: 80, max: 1000, step: 20, value: settings.max_chars, onChange: (e) => setSetting('max_chars', num(e.target.value)), 'aria-label': '最大文本长度' }),
              h('span', { className: 'wv-rangeval' }, settings.max_chars + ' 字')),
            h(SettingRow, { title: '最大语音时长', desc: '录音与播放的安全上限。', tip: '超过上限时任务会失败并恢复设备，不会无限录制。' },
              h('input', { className: 'wv-slider', type: 'range', min: 5, max: 60, step: 1, value: settings.max_duration, onChange: (e) => setSetting('max_duration', num(e.target.value)), 'aria-label': '最大语音时长' }),
              h('span', { className: 'wv-rangeval' }, settings.max_duration + ' s')),
            h(SettingRow, { title: '合成超时', desc: '只限制等待 Qwen 生成音频的时间。', tip: '不是微信发送总耗时；发送阶段另有等待界面与录音超时。' },
              h('input', { className: 'wv-input', type: 'number', min: 10, max: 600, value: settings.timeout, onChange: (e) => setSetting('timeout', Math.max(10, Math.min(600, num(e.target.value) || 10))), 'aria-label': '合成超时秒数' }),
              h('span', { className: 'wv-muted', style: { fontSize: 11 } }, '秒')),
            h(SettingRow, { title: '默认语言', desc: '当前后端主要按中文参考音色工作。' },
              h('select', { className: 'wv-select', value: settings.language, onChange: (e) => setSetting('language', e.target.value), 'aria-label': '默认语言' },
                h('option', { value: 'zh-CN' }, '中文（普通话）'),
                h('option', { value: 'en-US' }, 'English（演示）'),
                h('option', { value: 'auto' }, '自动检测（未接入）'))),
            h(SettingRow, { title: '音频格式', desc: '发送前统一为微信可用的本地 WAV。' },
              h('select', { className: 'wv-select', value: settings.format, onChange: (e) => setSetting('format', e.target.value), 'aria-label': '音频格式' },
                h('option', { value: 'wav' }, 'WAV · 24kHz / mono'),
                h('option', { value: 'mp3', disabled: true }, 'MP3 · 未接入'))),
            h(SettingRow, { title: '生成队列策略', desc: '当前生产为串行，避免抢占录音设备。' },
              h('select', { className: 'wv-select', value: settings.queue, onChange: (e) => setSetting('queue', e.target.value), 'aria-label': '队列策略' },
                h('option', { value: 'serial' }, '串行 · 推荐'),
                h('option', { value: 'parallel', disabled: true }, '并行 · 未接入'))),
            h(SettingRow, { title: 'Qwen 离线时', desc: '推荐降级为文字，不阻塞聊天。' },
              h('select', { className: 'wv-select', value: settings.offline_behavior, onChange: (e) => setSetting('offline_behavior', e.target.value), 'aria-label': '离线行为' },
                h('option', { value: 'text' }, '改为文字'),
                h('option', { value: 'fail' }, '任务失败'),
                h('option', { value: 'queue', disabled: true }, '排队等待 · 未接入'))))),
        h(Card, { title: '游戏模式', desc: '减少显存占用，避免语音发送打断游戏',
          actions: h(Badge, { tone: 'backend' }, '焦点守护已实现') },
          h('div', { className: 'wv-settings-group' },
            h(SettingRow, { title: '游戏时暂停语音任务', desc: '检测到全屏/活跃游戏时不再启动新任务。', tip: '前端演示；真实 Worker 已有活跃输入与前台守护。' },
              h(Toggle, { checked: settings.game_pause, onChange: (v) => setSetting('game_pause', v), label: '游戏时暂停语音任务' })),
            h(SettingRow, { title: '游戏时不抢微信焦点', desc: '用户正在操作其他窗口时安全拒绝。', tip: '真实实现：1500ms 空闲守护 + 前台校验。' },
              h(Toggle, { checked: settings.game_no_focus, onChange: (v) => setSetting('game_no_focus', v), label: '游戏时不抢焦点' })),
            h(SettingRow, { title: 'Qwen 离线时改为文字', desc: '避免等待或失败重试。' },
              h(Toggle, { checked: settings.game_offline_text, onChange: (v) => setSetting('game_offline_text', v), label: '离线改文字' })),
            h(SettingRow, { title: '自动启动 Qwen', desc: '未来功能；不会在本轮启动任何进程。' },
              h('div', { className: 'wv-row' }, h(Badge, { tone: 'wait' }, '未来功能'), h(Toggle, { checked: false, onChange: () => {}, disabled: true, label: '自动启动 Qwen' }))),
          h('div', { className: 'wv-notice', style: { marginTop: 12 } },
            h(Icon, { name: 'info', size: 15 }),
            h('span', null, '游戏模式只改变前端演示状态；真实焦点守护由 Worker 执行，本轮未修改。')))),
    )))
}

function MoreMenu({ contact, onCopy, onInfo }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return h('div', { className: 'wv-more-wrap', ref },
    h(IconButton, { icon: 'more', label: '更多操作', onClick: () => setOpen((v) => !v) }),
    open ? h('div', { className: 'wv-menu', role: 'menu' },
      h('button', { type: 'button', onClick: () => { setOpen(false); onCopy() } }, '复制目标 ID'),
      h('button', { type: 'button', onClick: () => { setOpen(false); onInfo() } }, '查看演示详情')) : null)
}

function PermissionsPage({ contacts, setContacts, groups, addGroup, removeGroup, notify, setup }) {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState({ id: '', name: '', mention: true, explicit: true, groupCooldown: 30, memberCooldown: 60 })
  const [errors, setErrors] = React.useState({})
  const [menuInfo, setMenuInfo] = React.useState(null)

  const patchForm = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const validate = () => {
    const next = {}
    const raw = String(form.id || '').trim()
    if (!raw) next.id = '群 ID 不能为空。'
    else if (/\*/.test(raw)) next.id = '不允许使用通配符。'
    else if (/\s/.test(raw)) next.id = '群 ID 不能包含空白字符。'
    else if (!/^(group:)?[A-Za-z0-9_-]{4,40}$/.test(raw)) next.id = '格式：4–40 位字母、数字、下划线或短横线，可带 group: 前缀。'
    else if (groups.some((g) => g.id === (raw.startsWith('group:') ? raw : 'group:' + raw))) next.id = '该群已在演示草稿中，不能重复添加。'
    if (!String(form.name || '').trim()) next.name = '群名称不能为空。'
    if (form.groupCooldown < 0 || form.groupCooldown > 3600) next.groupCooldown = '群冷却需在 0–3600 秒之间。'
    if (form.memberCooldown < 0 || form.memberCooldown > 86400) next.memberCooldown = '成员冷却需在 0–86400 秒之间。'
    setErrors(next)
    return Object.keys(next).length === 0
  }
  const save = () => {
    if (!validate()) return
    const raw = String(form.id).trim()
    addGroup({
      id: raw.startsWith('group:') ? raw : 'group:' + raw,
      name: String(form.name).trim(),
      mention: form.mention,
      explicit: form.explicit,
      groupCooldown: Number(form.groupCooldown),
      memberCooldown: Number(form.memberCooldown),
      status: 'draft',
      verified: false,
    })
    setOpen(false)
    setForm({ id: '', name: '', mention: true, explicit: true, groupCooldown: 30, memberCooldown: 60 })
    setErrors({})
  }
  const toggleContact = (id, value) => {
    setContacts((list) => list.map((c) => c.id === id ? { ...c, permission: value } : c))
    notify('仅修改前端演示权限；真实白名单未变化。', 'info')
  }

  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / PERMISSIONS',
      title: '权限管理',
      description: '声音应该被交给谁，由你决定。私聊白名单与群聊授权是两套独立的安全边界。',
      actions: h(React.Fragment, null,
        h(Button, { disabled: true, title: '等待身份服务接入；本轮不新增真实联系人。' }, h(Icon, { name: 'plus', size: 14 }), '添加联系人'),
        h(Button, { variant: 'primary', onClick: () => setOpen(true) }, h(Icon, { name: 'plus', size: 14 }), '新增授权群聊')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'shield', size: 15 }),
      h('span', null, '群聊语音只有在授权群中、真实 @ 小鲸鱼且明确请求语音时才会触发。默认不提供“允许所有群聊”快捷入口。')),
    h(ConfigReadout, { setup }),
    h('div', { className: 'wv-grid two' },
      h(Card, { title: '私聊白名单', desc: '只允许明确列出的私聊目标',
        actions: h(Badge, { tone: 'demo' }, '演示名单') },
        h('div', { className: 'wv-perm-row', style: { borderBottom: '1px solid var(--wv-hairline)', color: 'var(--wv-muted)', fontSize: 10.5, paddingTop: 0, paddingBottom: 6 } },
          h('span', null, ''), h('span', null, '联系人'), h('span', null, '状态'), h('span', { className: 'wv-hide-narrow' }, '触发条件'), h('span', null, '语音'), h('span', null, '')),
        contacts.map((contact) => h('div', { className: 'wv-perm-row', key: contact.id },
          h('div', { className: 'wv-avatar' }, contact.name.slice(0, 1)),
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'wv-perm-name' }, contact.name, !contact.verified ? h('span', { className: 'wv-badge demo', style: { marginLeft: 6 } }, '演示') : null),
            h('div', { className: 'wv-perm-id' }, contact.id)),
          h('div', null, contact.verified ? h(Status, { status: 'verified' }) : h(Badge, { tone: 'demo' }, '虚构示例')),
          h('div', { className: 'wv-perm-col optional' }, h('strong', null, contact.trigger), h('span', null, contact.verified ? '已验证目标' : '不会写入白名单')),
          h(Toggle, { checked: contact.permission, onChange: (v) => toggleContact(contact.id, v), label: contact.name + ' 语音权限' }),
          h(MoreMenu, { contact, onCopy: async () => { const ok = await copyText(contact.id); notify(ok ? '已复制目标 ID。' : '复制失败：剪贴板不可用。', ok ? 'success' : 'error') }, onInfo: () => setMenuInfo(contact) }))),
        h('div', { className: 'wv-notice', style: { marginTop: 12 } },
          h(Icon, { name: 'info', size: 15 }),
          h('span', null, '演示联系人是已验证目标；其他联系人仅用于展示虚构演示项，不会写入真实白名单。'))),
      h(Card, { title: '群聊白名单', desc: '默认没有任何已授权群聊',
        actions: h(Badge, { tone: 'wait' }, groups.length + ' 个演示草稿') },
        groups.length === 0 ? h(Empty, {
          icon: 'shield',
          title: '还没有已授权群聊',
          children: '历史配置里的群 ID 不会自动显示为已授权。新增群聊只保存为前端演示草稿，必须经过真实身份核验后才可能生效。',
          action: h(Button, { variant: 'primary', size: 'sm', onClick: () => setOpen(true) }, h(Icon, { name: 'plus', size: 13 }), '新增授权群聊'),
        }) : h('div', null,
          h('div', { className: 'wv-group-row', style: { color: 'var(--wv-muted)', fontSize: 10.5, paddingTop: 0, paddingBottom: 6 } },
            h('span', null, '群聊'), h('span', null, '状态'), h('span', { className: 'wv-group-optional' }, '@ / 意图'), h('span', { className: 'wv-group-optional' }, '冷却'), h('span', null, '')),
          groups.map((g) => h('div', { className: 'wv-group-row', key: g.id },
            h('div', { style: { minWidth: 0 } }, h('div', { className: 'wv-group-name' }, g.name), h('div', { className: 'wv-group-id' }, g.id)),
            h('div', null, h(Badge, { tone: 'wait' }, '演示草稿 · 未核验')),
            h('div', { className: 'wv-checkline wv-group-optional' }, (g.mention ? '必须 @' : '不要求 @') + ' · ' + (g.explicit ? '明确意图' : '任意')),
            h('div', { className: 'wv-checkline wv-group-optional' }, g.groupCooldown + 's / ' + g.memberCooldown + 's'),
            h(IconButton, { icon: 'x', label: '移除演示草稿', onClick: () => removeGroup(g.id) })))))
    ),
    open ? h(GroupDialog, { form, errors, patchForm, onClose: () => setOpen(false), onSave: save }) : null,
    menuInfo ? h(Modal, { title: menuInfo.name, subtitle: '演示联系人详情', size: 'sm', onClose: () => setMenuInfo(null), footer: h(Button, { onClick: () => setMenuInfo(null) }, '关闭') },
      h('div', { className: 'wv-stack' },
        h('dl', { className: 'wv-kv' }, h('dt', null, '目标'), h('dd', null, menuInfo.id), h('dt', null, '核验'), h('dd', null, menuInfo.verified ? '已验证（演示快照）' : '未核验'), h('dt', null, '触发'), h('dd', null, menuInfo.trigger)),
        h('div', { className: 'wv-notice warn' }, h(Icon, { name: 'lock', size: 15 }), h('span', null, menuInfo.note)))) : null)
}

function GroupDialog({ form, errors, patchForm, onClose, onSave }) {
  return h(Modal, {
    title: '新增授权群聊', subtitle: '演示表单 · 不会核验身份或写入真实白名单', onClose,
    footer: h(React.Fragment, null,
      h(Button, { onClick: onClose }, '取消'),
      h(Button, { variant: 'primary', onClick: onSave }, h(Icon, { name: 'check', size: 14 }), '保存演示草稿')),
  },
    h('div', { className: 'wv-notice', style: { marginBottom: 14 } },
      h(Icon, { name: 'info', size: 15 }),
      h('span', null, '保存后仅加入当前前端草稿，并显示「未核验」。真实群授权必须经过后端身份与白名单校验。')),
    h('div', { className: 'wv-form-grid' },
      h('div', { className: 'wv-field full' },
        h('label', null, '群 ID ', h('span', { className: 'wv-muted' }, '（必填）')),
        h('input', { className: 'wv-input ' + (errors.id ? 'invalid' : ''), value: form.id, placeholder: '例如 group:123456789', onChange: (e) => patchForm('id', e.target.value) }),
        errors.id ? h('span', { className: 'wv-error' }, errors.id) : h('span', { className: 'wv-hint' }, '4–40 位字母、数字、下划线或短横线；不支持通配符。')),
      h('div', { className: 'wv-field full' },
        h('label', null, '群名称 ', h('span', { className: 'wv-muted' }, '（必填）')),
        h('input', { className: 'wv-input ' + (errors.name ? 'invalid' : ''), value: form.name, placeholder: '例如 产品群', onChange: (e) => patchForm('name', e.target.value) }),
        errors.name ? h('span', { className: 'wv-error' }, errors.name) : null),
      h('div', { className: 'wv-field' },
        h('label', null, '真实 @ 要求'),
        h('select', { className: 'wv-select', value: form.mention ? 'yes' : 'no', onChange: (e) => patchForm('mention', e.target.value === 'yes') },
          h('option', { value: 'yes' }, '必须 @ 小鲸鱼'),
          h('option', { value: 'no' }, '不要求 @（不推荐）'))),
      h('div', { className: 'wv-field' },
        h('label', null, '明确语音意图'),
        h('select', { className: 'wv-select', value: form.explicit ? 'yes' : 'no', onChange: (e) => patchForm('explicit', e.target.value === 'yes') },
          h('option', { value: 'yes' }, '必须明确请求语音'),
          h('option', { value: 'no' }, '任意消息（不推荐）'))),
      h('div', { className: 'wv-field' },
        h('label', null, '群冷却（秒）'),
        h('input', { className: 'wv-input ' + (errors.groupCooldown ? 'invalid' : ''), type: 'number', min: 0, max: 3600, value: form.groupCooldown, onChange: (e) => patchForm('groupCooldown', Number(e.target.value)) }),
        errors.groupCooldown ? h('span', { className: 'wv-error' }, errors.groupCooldown) : h('span', { className: 'wv-hint' }, '0–3600 秒')),
      h('div', { className: 'wv-field' },
        h('label', null, '成员冷却（秒）'),
        h('input', { className: 'wv-input ' + (errors.memberCooldown ? 'invalid' : ''), type: 'number', min: 0, max: 86400, value: form.memberCooldown, onChange: (e) => patchForm('memberCooldown', Number(e.target.value)) }),
        errors.memberCooldown ? h('span', { className: 'wv-error' }, errors.memberCooldown) : h('span', { className: 'wv-hint' }, '0–86400 秒'))))
}

function StudioPage({ preview, setPreview, notify, setup }) {
  const patch = (key, value) => setPreview((p) => ({ ...p, [key]: value }))
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / STUDIO',
      title: '音色中心',
      description: 'whale-v1 是小鲸鱼目前唯一的专属音色。试听面板为前端演示，不调用真实 Qwen API。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: 'demo' }, '试听未接入'),
        h(Button, { disabled: true, title: '等待语音服务接入' }, h(Icon, { name: 'play', size: 14 }), '等待语音服务接入')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '本轮不合成真实音频。生成与播放按钮保持禁用；下方波形为示意，不代表真实音频。')),
    h(ConfigReadout, { setup }),
    h('div', { className: 'wv-studio' },
      h('section', { className: 'wv-card wv-studio-profile' },
        h('div', { className: 'wv-studio-hero' },
          h('div', { className: 'wv-studio-title' },
            h('div', { className: 'wv-row' }, h('h2', null, 'whale-v1'), h(Badge, { tone: 'accent' }, '已有音色')),
            h('p', null, '小鲸鱼专属声音 · Qwen3-TTS 1.7B Base'),
            h('p', { style: { marginTop: 7 } }, '由参考音频克隆而来，保留小鲸鱼现有的语气与亲昵感。')),
          h(WaveBars, { count: 44, seed: 11 })),
        h('div', { className: 'wv-studio-meta' },
          h('div', { className: 'wv-metaitem' }, h('span', null, '模型'), h('strong', null, 'Qwen3-TTS 1.7B Base')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '创建方式'), h('strong', null, '参考音频克隆')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '版本'), h('strong', null, 'v1.0 · 已就绪')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '参考音频'), h('strong', null, '265 KB · 已锁定')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '语言'), h('strong', null, '中文（普通话）')),
          h('div', { className: 'wv-metaitem' }, h('span', null, '状态'), h('strong', null, '演示 · 不合成'))),
        h('div', { style: { padding: '0 20px 18px' } },
          h('div', { className: 'wv-versions' },
            h('div', { className: 'wv-version on' }, h('div', null, h('strong', null, 'whale-v1'), h('span', null, '当前 · 小鲸鱼专属')), h(Badge, { tone: 'backend' }, '可用')),
            h('div', { className: 'wv-version' }, h('div', null, h('strong', null, 'whale-v2'), h('span', null, '未来版本 · 未训练')), h(Badge, { tone: 'wait' }, '计划中')),
            h('div', { className: 'wv-version' }, h('div', null, h('strong', null, '自定义音色'), h('span', null, '未来功能')), h(Badge, { tone: 'wait' }, '未接入'))))),
      h('section', { className: 'wv-card pad wv-preview' },
        h('div', { className: 'wv-card-title' },
          h('div', null, h('h2', null, '试听面板'), h('p', null, '演示文本与参数不会发送到 Qwen')),
          h(Badge, { tone: 'wait' }, 'Mock')),
        h('div', { className: 'wv-field' },
          h('label', null, '试听文本'),
          h('textarea', { className: 'wv-textarea', value: preview.text, onChange: (e) => patch('text', e.target.value), maxLength: 300, 'aria-label': '试听文本' }),
          h('span', { className: 'wv-hint' }, preview.text.length + ' / 300')),
        h('div', { className: 'wv-preview-controls' },
          h('div', { className: 'wv-field' }, h('label', null, '音色'), h('select', { className: 'wv-select', value: preview.voice, onChange: (e) => patch('voice', e.target.value) }, h('option', { value: 'whale-v1' }, 'whale-v1'))),
          h('div', { className: 'wv-field' }, h('label', null, '语言'), h('select', { className: 'wv-select', value: preview.language, onChange: (e) => patch('language', e.target.value) }, h('option', { value: 'zh-CN' }, '中文'), h('option', { value: 'en-US' }, 'English'))),
          h('div', { className: 'wv-field' }, h('label', null, '情绪 ', h(Badge, { tone: 'wait' }, '实验性')), h('select', { className: 'wv-select', value: preview.emotion, onChange: (e) => patch('emotion', e.target.value) }, EMOTIONS.map((x) => h('option', { key: x.id, value: x.id }, x.zh + ' / ' + x.en))))),
        h('div', { className: 'wv-player' },
          h('div', { className: 'wv-player-wave', 'aria-label': '示意波形，非真实音频' }, h(WaveBars, { count: 58, seed: 5 }), h('span', { className: 'playhead' })),
          h('div', { className: 'wv-player-controls' },
            h(IconButton, { icon: 'play', label: '播放（未接入）', disabled: true }),
            h('div', { className: 'wv-progress', 'aria-hidden': true }, h('i', null)),
            h('span', { className: 'wv-time' }, '0:00 / --:--'),
            h('div', { className: 'wv-volume' }, h(Icon, { name: 'volume', size: 14 }), h('input', { type: 'range', min: 0, max: 100, value: preview.volume, disabled: true, onChange: (e) => patch('volume', Number(e.target.value)), 'aria-label': '音量（未接入）' })))),
        h('div', { className: 'wv-empty', style: { minHeight: 96 } },
          h('div', { className: 'wv-empty-icon' }, h(Icon, { name: 'wave', size: 18 })),
          h('strong', null, '还没有可播放的试听音频'),
          h('p', null, '本轮不调用 Qwen，也不伪造试听成功。等待语音服务接入后，这里会显示真实音频与进度。')),
        h('div', { className: 'wv-row wv-wrap' },
          h(Button, { disabled: true, title: '等待语音服务接入' }, h(Icon, { name: 'spark', size: 14 }), '生成试听 · 等待语音服务接入'),
          h(Button, { variant: 'ghost', onClick: () => notify('试听不会在本轮调用真实 Qwen。', 'info') }, '了解限制')))
    ))
}

function EmotionsPage({ emotion, setEmotion, notify }) {
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / EMOTION',
      title: '情绪系统',
      description: '为未来的情绪表达预留控制层。当前 Qwen3-TTS Base 的克隆音色不保证精确、可复现的情绪控制。',
      actions: h(Badge, { tone: 'wait' }, '实验性 · 等待后端支持'),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'alert', size: 15 }),
      h('span', null, '情绪选择目前只影响前端演示状态，不会改变真实 TTS 生成，也不会修改人格卡、参考音频或 VoiceDesign。')),
    h('div', { className: 'wv-grid two', style: { alignItems: 'start' } },
      h(Card, { title: '情绪预设', desc: '选择一种希望小鲸鱼表达的语气', actions: h(Badge, { tone: 'demo' }, '演示选择') },
        h('div', { className: 'wv-emotions' }, EMOTIONS.map((e) => h('button', {
          key: e.id, type: 'button', className: 'wv-emotion', 'aria-pressed': emotion === e.id,
          onClick: () => { setEmotion(e.id); notify('已选择「' + e.zh + '」演示情绪；真实生成未改变。', 'info') },
        },
          h('span', { className: 'wv-emotion-icon' }, h(Icon, { name: e.icon, size: 16 })),
          h('strong', null, e.zh + ' / ' + e.en),
          h('span', null, e.desc),
          emotion === e.id ? h(Badge, { tone: 'accent' }, '已选择') : null)))),
      h('div', { className: 'wv-stack' },
        h(Card, { title: '情绪强度', desc: '未来可按消息调整，当前不可用' },
          h('div', { className: 'wv-setting', style: { borderBottom: 0 } },
            h('div', { className: 'wv-setting-copy' }, h('strong', null, '强度'), h('p', null, '实验性参数；真实模型暂无稳定映射。')),
            h('div', { className: 'wv-setting-control' },
              h('input', { className: 'wv-slider', type: 'range', min: 0, max: 100, value: 55, disabled: true, 'aria-label': '情绪强度（未接入）' }),
              h('span', { className: 'wv-rangeval' }, '55%'))),
          h('div', { className: 'wv-notice' }, h(Icon, { name: 'info', size: 15 }), h('span', null, '不承诺“立即生效”，等待后端提供可验证的情绪控制接口。'))),
        h(Card, { title: '自动情绪判断', desc: '从上下文推断，而不是硬编码' },
          h('div', { className: 'wv-setting' },
            h('div', { className: 'wv-setting-copy' }, h('strong', null, '自动判断'), h('p', null, '未来功能；本轮不会读取聊天内容。')),
            h('div', { className: 'wv-setting-control' }, h(Badge, { tone: 'wait' }, '未接入'), h(Toggle, { checked: false, onChange: () => {}, disabled: true, label: '自动情绪判断' }))),
          h('div', { className: 'wv-setting', style: { borderBottom: 0 } },
            h('div', { className: 'wv-setting-copy' }, h('strong', null, '与人格卡联动'), h('p', null, '不修改人格卡、记忆或 Prompt Cache。')),
            h('div', { className: 'wv-setting-control' }, h(Badge, { tone: 'wait' }, '未接入')))),
        h(Card, { title: '场景映射', desc: '按场景分配情绪', actions: h(Badge, { tone: 'wait' }, '空状态') },
          h(Empty, { icon: 'target', title: '还没有场景规则', children: '例如「晚安 → 温柔」「庆祝 → 开心」。等待后端支持后再配置。' })))))
}

function ActivityPage({ notify, openActivity }) {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [kind, setKind] = React.useState('all')
  const [tick, setTick] = React.useState(0)
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return MOCK_ACTIVITIES.filter((a) => {
      if (status !== 'all' && a.status !== status) return false
      if (kind !== 'all' && a.kind !== kind) return false
      if (!q) return true
      return (a.id + ' ' + a.target + ' ' + a.voice + ' ' + a.status + ' ' + a.error).toLowerCase().includes(q)
    })
  }, [query, status, kind, tick])
  const refresh = () => { setTick((x) => x + 1); notify('演示任务已刷新；未读取真实队列。', 'success') }
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / ACTIVITY',
      title: '任务与日志',
      description: '查看语音任务的生命周期、发送状态与错误诊断。本页全部为演示数据，不读取真实聊天内容。',
      actions: h(React.Fragment, null,
        h(Badge, { tone: 'demo' }, 'Mock 记录'),
        h(Button, { onClick: refresh }, h(Icon, { name: 'refresh', size: 14 }), '刷新演示')),
    }),
    h('div', { className: 'wv-notice', style: { marginBottom: 14 } },
      h(Icon, { name: 'info', size: 15 }),
      h('span', null, 'SENT_LOCAL 只表示本地观察到新气泡，不等同于对方已经收到。UNKNOWN 表示结果不确定，系统不会自动重发。')),
    h('section', { className: 'wv-card', style: { overflow: 'hidden' } },
      h('div', { className: 'wv-toolbar' },
        h('div', { className: 'wv-search' }, h(Icon, { name: 'search', size: 14 }), h('input', { className: 'wv-input withicon', placeholder: '搜索目标、ID 或错误…', value: query, onChange: (e) => setQuery(e.target.value), 'aria-label': '搜索任务' })),
        h('div', { className: 'wv-filters' },
          h('select', { className: 'wv-select', value: status, onChange: (e) => setStatus(e.target.value), 'aria-label': '状态筛选', style: { width: 132 } },
            h('option', { value: 'all' }, '全部状态'),
            ['SENT_LOCAL', 'FAILED', 'UNKNOWN', 'QUEUED', 'WAITING_FOR_UI', 'REJECTED'].map((s) => h('option', { key: s, value: s }, STATUS[s] ? STATUS[s].label : s))),
          h('select', { className: 'wv-select', value: kind, onChange: (e) => setKind(e.target.value), 'aria-label': '会话类型筛选', style: { width: 112 } },
            h('option', { value: 'all' }, '全部会话'), h('option', { value: '私聊' }, '私聊'), h('option', { value: '群聊' }, '群聊')),
          h('span', { className: 'wv-muted', style: { fontSize: 11 } }, filtered.length + ' 条'))),
      filtered.length === 0 ? h('div', { style: { padding: 16 } }, h(Empty, { icon: 'search', title: '没有匹配的演示任务', children: '尝试清空搜索或切换筛选条件。' })) :
        h('div', { className: 'wv-tablewrap' }, h('table', { className: 'wv-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Request'), h('th', null, '时间'), h('th', null, '目标'), h('th', null, '类型'), h('th', null, '音色'), h('th', null, '合成'), h('th', null, '音频'), h('th', null, '状态'), h('th', null, '错误'))),
          h('tbody', null, filtered.map((a) => h('tr', {
            key: a.id, tabIndex: 0, onClick: () => openActivity(a),
            onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openActivity(a) } },
          },
            h('td', { className: 'id' }, a.id), h('td', { className: 'num' }, a.time), h('td', null, a.target), h('td', null, a.kind), h('td', null, a.voice),
            h('td', { className: 'num' }, a.synth), h('td', { className: 'num' }, a.audio), h('td', null, h(Status, { status: a.status })),
            h('td', { className: 'id' }, a.error || '—'))))))),
    h('div', { style: { height: 14 } }),
    h('div', { className: 'wv-grid two' },
      h(Card, { title: '状态说明', desc: '统一语义，而不是只靠颜色' },
        h('div', { className: 'wv-stack' },
          h('div', { className: 'wv-row' }, h(Status, { status: 'SENT_LOCAL' }), h('span', { className: 'wv-small wv-muted' }, '本地已观察气泡，不代表服务器或对方已确认接收。')),
          h('div', { className: 'wv-row' }, h(Status, { status: 'FAILED' }), h('span', { className: 'wv-small wv-muted' }, '任务失败，可查看错误详情；是否已发生副作用需看阶段。')),
          h('div', { className: 'wv-row' }, h(Status, { status: 'UNKNOWN' }), h('span', { className: 'wv-small wv-muted' }, '发送结果不确定，禁止自动补发文字或语音。')),
          h('div', { className: 'wv-row' }, h(Status, { status: 'REJECTED' }), h('span', { className: 'wv-small wv-muted' }, '白名单、权限或测试名额在入队前拒绝。')))),
      h(Card, { title: '错误诊断', desc: '演示错误码，可复制到排查记录', actions: h(Badge, { tone: 'demo' }, '只读') },
        h('div', { className: 'wv-stack' },
          ['not_foreground', 'sender_timeout', 'group_not_allowed', 'cancel_unconfirmed'].map((e) => h('div', { key: e, className: 'wv-between' },
            h('code', { className: 'wv-code' }, e),
            h(Button, { variant: 'ghost', size: 'sm', onClick: async () => { const ok = await copyText(e); notify(ok ? '已复制错误码。' : '复制失败：剪贴板不可用。', ok ? 'success' : 'error') } }, h(Icon, { name: 'copy', size: 12 }), '复制')))))))
}

function AdvancedPage({ notify, setup, onSetup, onComponents }) {
  const diag = React.useMemo(() => JSON.stringify({
    plugin: 'dsh-whale-voice', version: '0.1.0', mode: 'mock',
    bridge: 'r4 (demo)', target: 'private:demo-1001', voice: 'whale-v1',
    focusGuard: 'foreground-required', configWrite: false,
  }, null, 2), [])
  const copyDiag = async () => {
    const ok = await copyText(diag)
    notify(ok ? '诊断摘要已复制。' : '复制失败：剪贴板不可用。', ok ? 'success' : 'error')
  }
  return h(React.Fragment, null,
    h(PageHead, {
      eyebrow: 'WHALE VOICE / ADVANCED',
      title: '高级设置',
      description: '只读的技术信息与诊断入口。所有真实服务控制操作均未接入，不会启动或结束现有进程。',
      actions: h(React.Fragment, null, h(Badge, { tone: 'wait' }, '只读 · 未接入'), h(Button, { onClick: copyDiag }, h(Icon, { name: 'copy', size: 14 }), '复制诊断摘要')),
    }),
    h('div', { className: 'wv-notice warn', style: { marginBottom: 14 } },
      h(Icon, { name: 'lock', size: 15 }),
      h('span', null, '本页不会写入配置、不会启动 Qwen、不会结束进程。数值为演示占位，真实值需等待后端接入。')),
    h(ConfigReadout, { setup }),
    h('div', { className: 'wv-adv-grid' },
      h(Card, { title: '语音引擎', desc: 'Qwen3-TTS Provider', actions: h(Badge, { tone: 'demo' }, '只读') },
        h('dl', { className: 'wv-kv' }, ADVANCED.engine.map(([k, v], i) => h(React.Fragment, { key: i }, h('dt', null, k), h('dd', null, v))))),
      h(Card, { title: 'Voice Sender', desc: '桌面音频执行器', actions: h(Badge, { tone: 'demo' }, '只读') },
        h('dl', { className: 'wv-kv' }, ADVANCED.sender.map(([k, v], i) => h(React.Fragment, { key: i }, h('dt', null, k), h('dd', null, v))))),
      h(Card, { title: 'WeChatAgent', desc: 'Bridge 与配置映射', actions: h(Badge, { tone: 'demo' }, '只读') },
        h('dl', { className: 'wv-kv' }, ADVANCED.wechat.map(([k, v], i) => h(React.Fragment, { key: i }, h('dt', null, k), h('dd', null, v))))),
      h(Card, { title: '安装与组件', desc: '首次安装向导与组件生命周期入口', actions: h(Badge, { tone: setup && setup.available ? 'accent' : 'wait' }, setup && setup.available ? 'Core 已连接' : 'Core 未连接') },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '首次安装向导', desc: '连接微信助手、安装语音发送器、选择 TTS、完成检查' },
            h(Button, { onClick: onSetup }, '打开向导')),
          h(SettingRow, { title: '组件管理', desc: '检测 WeChatAgent、Voice Sender 与 TTS 状态' },
            h(Button, { variant: 'ghost', onClick: onComponents }, '管理组件'))),
        h('div', { className: 'wv-notice', style: { marginTop: 10 } },
          h(Icon, { name: 'lock', size: 14 }),
          h('span', null, '向导不会直接执行系统命令；安装、升级、驱动与微信操作均需要 Core 和你的单独确认。'))),
      h(Card, { title: '开发与诊断', desc: '前端版本与 Mock 说明', actions: h(Badge, { tone: 'demo' }, 'Mock') },
        h('div', { className: 'wv-settings-group' },
          h(SettingRow, { title: '前端版本', desc: 'dsh-whale-voice' }, h('span', { className: 'wv-mono' }, 'v0.1.0')),
          h(SettingRow, { title: '构建信息', desc: 'Client-only bundle · plain JS' }, h('span', { className: 'wv-mono' }, 'r1 / mock')),
          h(SettingRow, { title: '配置格式验证', desc: '等待配置管理 API 接入' }, h(Button, { disabled: true, title: '未接入' }, '验证')),
          h(SettingRow, { title: '调试日志', desc: '不会写入真实日志' }, h(Toggle, { checked: false, onChange: () => {}, disabled: true, label: '调试日志' }))),
        h('pre', { className: 'wv-diag', style: { marginTop: 12 } }, diag),
        h('div', { className: 'wv-row wv-wrap', style: { marginTop: 10 } },
          h(Button, { onClick: copyDiag }, h(Icon, { name: 'copy', size: 14 }), '复制摘要'),
          h(Button, { variant: 'ghost', onClick: () => notify('没有启动或停止任何真实服务。', 'info') }, '安全说明')))
    ))
}

/* Whale Voice first-run setup UI and component manager.
 *
 * This module is injected after pages.js by build.mjs. It contains browser UI only.
 * There is no shell, no installer execution and no arbitrary URL fetching here.
 * Real setup operations must be exposed by the future Whale Voice Core through
 * window.__WHALE_SETUP__; the adapter contract is documented in docs/SETUP_API.md.
 */

const SETUP_STEPS = [
  { id: 'wechat', label: '连接微信助手', short: '微信助手', icon: 'chat' },
  { id: 'sender', label: '安装微信语音功能', short: '语音功能', icon: 'wave' },
  { id: 'tts', label: '选择小鲸鱼的声音', short: '声音', icon: 'spark' },
  { id: 'finish', label: '完成检查', short: '检查', icon: 'check' },
]

const SETUP_STATE_LABELS = {
  NOT_INSTALLED: '未安装',
  DETECTING: '检测中',
  READY_TO_INSTALL: '可以安装',
  DOWNLOADING: '获取安装包',
  VERIFYING: '验证完整性',
  INSTALLING: '安装中',
  CONFIGURING: '配置中',
  VALIDATING: '验证中',
  INSTALLED: '已安装',
  NEEDS_REPAIR: '需要修复',
  FAILED: '安装失败',
  CANCELLED: '已取消',
  connected: '已连接',
  connecting: '连接中',
  not_installed: '未安装',
  not_running: '未启动',
  incompatible: '版本不兼容',
  auth_required: '需要授权',
  connection_failed: '连接失败',
  timeout: '检测超时',
  unsupported: '不支持',
  invalid_response: '响应无效',
  not_configured: '未配置',
  unknown: '未知',
  unexpected_response: '响应异常',
  running: '运行中',
  ok: '正常',
  error: '连接异常',
  healthy: '运行正常',
  installed: '已安装',
  compatible: '兼容',
}

const MOCK_SETUP = {
  demo: true,
  completed: false,
  core: { version: '0.1.0-demo', mode: 'demo' },
  environment: { windows: true, architecture: 'x64', node: '22.x', powershell: true, dotnet: true },
  wechatAgent: {
    state: 'connected', installed: true, version: '0.3.9 (demo)', processRunning: true,
    connected: true, accountVerified: true, reader: 'ok', bridge: 'ok', dsh: 'ok',
    compatibility: 'compatible', wechatVersion: '4.1.10.27 (demo)',
  },
  sender: {
    state: 'installed', installed: true, version: '0.1.0 (demo)', health: 'healthy',
    powershell: true, dotnet: true, node: true, vbCable: true, capture: 'VB-Audio Virtual Cable',
    queue: 0, recoveryPending: false,
  },
  tts: { configured: false, provider: null, available: ['qwen-local', 'cloud', 'custom'], preview: { ok: false, reason: 'not_configured' } },
  diagnostic: { canSend: false, pendingRecovery: false },
}

function readSetupStatus() {
  const bridge = typeof window !== 'undefined' ? window.__WHALE_SETUP__ : null
  return readBridgeSetupStatus(bridge, { timeoutMs: 5000 })
}

function setupStateLabel(state) {
  return SETUP_STATE_LABELS[state] || (state ? String(state) : '状态未知')
}

function setupStateTone(state) {
  if (state === 'connected' || state === 'installed' || state === 'INSTALLED' || state === 'compatible' || state === 'healthy' || state === 'ok') return 'online'
  if (state === 'connecting' || state === 'DETECTING' || state === 'DOWNLOADING' || state === 'VERIFYING' || state === 'INSTALLING' || state === 'CONFIGURING' || state === 'VALIDATING') return 'starting'
  if (state === 'not_installed' || state === 'not_running' || state === 'NOT_INSTALLED') return 'offline'
  if (state === 'incompatible' || state === 'FAILED' || state === 'NEEDS_REPAIR' || state === 'error') return 'error'
  return 'unknown'
}

function setupBool(value, yes = '就绪', no = '未就绪') {
  if (value === null || typeof value === 'undefined') return '未知'
  return value ? yes : no
}

function setupViewStateText(state) {
  return state === 'pass' ? '通过' : state === 'fail' ? '未通过' : '未知'
}

function setupTri(value) {
  return value === true ? 'pass' : value === false ? 'fail' : 'unknown'
}

function SetupMark({ ok, state, label, value }) {
  const tri = state || (ok ? 'pass' : 'fail')
  return h('div', { className: 'wv-setup-check' },
    h('span', { className: 'wv-setup-check-icon ' + tri }, h(Icon, { name: tri === 'pass' ? 'check' : tri === 'fail' ? 'alert' : 'info', size: 13 })),
    h('span', { className: 'wv-setup-check-label' }, label),
    h('span', { className: 'wv-setup-check-value' }, value))
}

function SetupStatusPill({ state, demo }) {
  return h('span', { className: 'wv-setup-pill ' + (demo ? 'demo' : setupStateTone(state)) },
    demo ? '演示' : setupStateLabel(state))
}

function SetupEvidence({ data }) {
  if (!data || !data.observedAt) return null
  const source = data.evidence || data.source || 'Core 只读检测'
  return h('div', { className: 'wv-setup-evidence' },
    h(Icon, { name: 'clock', size: 12 }),
    h('span', null, '检测于 ' + String(data.observedAt).replace('T', ' ').slice(0, 19)),
    h('span', { className: 'wv-setup-evidence-sep' }, '·'),
    h('span', { title: source }, '来源：' + String(source).slice(0, 120)))
}

function SetupBlocked({ status, onRefresh, onDemo, onNotify }) {
  const unavailable = status.reason === 'core_not_connected'
  return h('div', { className: 'wv-setup-blocked' },
    h('div', { className: 'wv-setup-blocked-icon' }, h(Icon, { name: 'lock', size: 22 })),
    h('h3', null, unavailable ? '还需要连接 Whale Voice Core' : 'Core 检测暂时不可用'),
    h('p', null, unavailable
      ? '真实安装状态必须由 Core 保存并检测。当前前端不会用 LocalStorage 或 Mock 数据冒充安装完成。'
      : 'Core 返回了不可用状态，请检查本地服务或稍后重试。'),
    h('div', { className: 'wv-row wv-wrap' },
      h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), status.checking ? '检测中' : '重新检测'),
      h(Button, { variant: 'ghost', onClick: onDemo }, '查看演示流程'),
      h(Button, { variant: 'ghost', onClick: () => onNotify('安装 API 尚未接入 Core；不会执行任何系统命令。', 'info') }, '接口说明')))
}

function SetupStepNav({ step, setStep, maxStep = 3 }) {
  return h('div', { className: 'wv-setup-steps', role: 'tablist', 'aria-label': '安装步骤' },
    SETUP_STEPS.map((s, i) => h('button', {
      key: s.id, type: 'button', role: 'tab', 'aria-selected': step === i,
      className: 'wv-setup-step' + (step === i ? ' active' : '') + (i < step ? ' done' : ''),
      onClick: () => { if (i <= maxStep) setStep(i) },
      disabled: i > maxStep,
    },
      h('span', { className: 'wv-setup-step-num' }, i < step ? h(Icon, { name: 'check', size: 12 }) : i + 1),
      h('span', { className: 'wv-setup-step-copy' },
        h('strong', null, s.short),
        h('small', null, s.label)))))
}

function SetupWeChatStep({ data, demo, status, onRefresh, onNotify }) {
  const wa = data && data.wechatAgent
  const waView = deriveSetupView(data).wechat
  const connected = waView.connected === true
  const unknownConnection = waView.connected === null
  const missing = Boolean(wa && (wa.state === 'not_installed' || wa.installed === false))
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' }, h(Icon, { name: 'chat', size: 22 })),
      h('div', null,
        h('h3', null, '连接微信助手'),
        h('p', null, 'WeChatAgent 帮助小鲸鱼连接微信，接收和回复消息。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 非真实状态') : null)),
    !data ? h(SetupBlocked, { status, onRefresh, onDemo: () => {}, onNotify }) : h(React.Fragment, null,
      h('div', { className: 'wv-setup-statusline' },
        h('span', { className: 'wv-setup-statuslabel' }, 'WeChatAgent'),
        h(SetupStatusPill, { state: wa && wa.state, demo }),
        h('span', { className: 'wv-muted' }, wa && wa.version ? 'v' + wa.version : '版本未知'),
        h('span', { className: 'wv-muted' }, wa && wa.wechatVersion ? '微信 ' + wa.wechatVersion + (wa.wechatVersionVerified ? '' : '（配置期望，未验证）') : '微信版本未知')),
      h(SetupEvidence, { data: wa }),
      h('div', { className: 'wv-setup-checks' },
        h(SetupMark, { state: waView.installedState, label: '程序安装', value: setupViewStateText(waView.installedState) }),
        h(SetupMark, { state: setupTri(waView.processRunning), label: '进程运行', value: setupViewStateText(setupTri(waView.processRunning)) }),
        h(SetupMark, { state: waView.accountVerified, label: '账号验证', value: setupViewStateText(waView.accountVerified) }),
        h(SetupMark, { state: waView.connectedState, label: '微信连接', value: setupViewStateText(waView.connectedState) }),
        h(SetupMark, { state: waView.reader === 'ok' ? 'pass' : 'unknown', label: 'Reader', value: waView.reader === 'ok' ? '正常' : waView.reader === 'running' ? '运行中（未验证）' : '未知' }),
        h(SetupMark, { state: waView.bridge === 'ok' ? 'pass' : waView.bridge === 'connection_failed' ? 'fail' : 'unknown', label: 'Bridge', value: waView.bridge === 'ok' ? '正常' : setupStateLabel(waView.bridge) }),
        h(SetupMark, { state: waView.dsh === 'ok' ? 'pass' : 'unknown', label: 'DSH 连接', value: waView.dsh === 'ok' ? '已连接' : '未知' }),
        h(SetupMark, { state: waView.compatibility, label: '接口兼容性', value: waView.compatibility === 'pass' ? '兼容' : '未知' })),
      missing ? h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'alert', size: 16 }),
        h('div', null,
          h('strong', null, '尚未检测到 WeChatAgent'),
          h('p', null, '安装并连接 WeChatAgent 后，才能让 AI 在微信中发送语音消息。'),
          h('p', { className: 'wv-muted' }, '微信登录、数据库授权和 Hook 流程由 WeChatAgent 自己完成；Whale Voice 不会重新实现这些步骤。'))) : null,
      !connected && !missing ? h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'info', size: 16 }),
        h('div', null, h('strong', null, unknownConnection ? '微信助手连接状态未知' : '微信助手还没有连接'),
          h('p', null, unknownConnection ? 'Core 没有返回明确的连接状态；不能据此判断已连接或已断开。' : '请打开 WeChatAgent 完成登录和连接，然后重新检测。'))) : null,
      connected ? h('div', { className: 'wv-setup-callout ok' },
        h(Icon, { name: 'check', size: 16 }),
        h('div', null, h('strong', null, '微信助手已连接'), h('p', null, demo ? '这是演示状态，不代表真实 WeChatAgent 已连接。' : '当前满足前端可见的连接条件；真实语音仍需单独授权。'))) : null,
      h('div', { className: 'wv-setup-actions' },
        h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), status.checking ? '检测中' : '重新检测'),
        h(Button, { variant: 'ghost', onClick: () => window.open('https://github.com/sourcepro5/WeChatAgent', '_blank', 'noopener,noreferrer') }, h(Icon, { name: 'external', size: 14 }), '打开官方 GitHub'),
        h(Button, { variant: 'ghost', onClick: () => onNotify('兼容性基线见 docs/WECHATAGENT_COMPATIBILITY.md；当前未执行真实连接测试。', 'info') }, '查看兼容性'))))
}

function SetupSenderStep({ data, demo, status, onRefresh, onNotify }) {
  const sender = data && data.sender
  const senderView = deriveSetupView(data).sender
  const installed = senderView.installedState === 'pass'
  const installedUnknown = senderView.installedState === 'unknown'
  const env = data && data.environment
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' }, h(Icon, { name: 'wave', size: 22 })),
      h('div', null,
        h('h3', null, '安装微信语音功能'),
        h('p', null, '让小鲸鱼可以在微信中发送真正的语音消息。'),
        h('p', { className: 'wv-muted' }, '技术名称：Voice Sender。它是独立安装的 Windows 组件，不会并入 Whale Voice Core。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 不执行安装') : null)),
    data && data.senderEvidence ? h(SetupEvidence, { data: data.senderEvidence }) : null,
    !data ? h('div', { className: 'wv-setup-callout warn' }, h(Icon, { name: 'lock', size: 16 }), h('div', null, h('strong', null, '安装能力尚未接入'), h('p', null, '真实安装需要 Whale Voice Core 的 Installer API。本页面不会下载或执行任何安装脚本。'))) : h(React.Fragment, null,
      h('div', { className: 'wv-setup-checks two', style: { marginBottom: 8 } },
        h(SetupMark, { state: senderView.installedState, label: '安装状态', value: setupViewStateText(senderView.installedState) }),
        h(SetupMark, { state: senderView.processState, label: '进程存在', value: setupViewStateText(senderView.processState) }),
        h(SetupMark, { state: senderView.healthReachableState, label: '健康接口可访问', value: senderView.healthStatus ? ('HTTP ' + senderView.healthStatus) : setupViewStateText(senderView.healthReachableState) }),
        h(SetupMark, { state: senderView.healthyState, label: '服务健康', value: setupViewStateText(senderView.healthyState) + (senderView.healthState !== 'unknown' ? ' · ' + setupStateLabel(senderView.healthState) : '') })),
      h('div', { className: 'wv-setup-checks two' },
        h(SetupMark, { state: setupTri(env && env.windows), label: 'Windows', value: env && env.architecture ? env.architecture : '未知' }),
        h(SetupMark, { state: setupTri(env && env.powershell), label: 'PowerShell', value: setupViewStateText(setupTri(env && env.powershell)) }),
        h(SetupMark, { state: setupTri(env && env.dotnet), label: 'C# / .NET', value: setupViewStateText(setupTri(env && env.dotnet)) }),
        h(SetupMark, { state: setupTri(env && env.node), label: 'Node 运行时', value: setupViewStateText(setupTri(env && env.node)) }),
        h(SetupMark, { state: setupTri(sender && sender.vbCable), label: 'VB-CABLE', value: setupBool(sender && sender.vbCable, '就绪', '未就绪') }),
        h(SetupMark, { state: sender && sender.capture ? 'pass' : 'unknown', label: '默认录音设备', value: sender && sender.capture ? sender.capture : '未知' }),
        h(SetupMark, { state: setupTri(sender && sender.recoveryPending === false ? true : sender && sender.recoveryPending === true ? false : null), label: '音频恢复快照', value: sender && typeof sender.recoveryPending === 'boolean' ? (sender.recoveryPending ? '待恢复' : '无待恢复') : '未知' }),
        h(SetupMark, { state: setupTri(sender && sender.queue === 0 ? true : sender && typeof sender.queue === 'number' ? false : null), label: '任务队列', value: sender && typeof sender.queue === 'number' ? (sender.queue > 0 ? String(sender.queue) + ' 个任务' : '空闲') : '未知' })),
      installed ? h('div', { className: 'wv-setup-callout ok' },
        h(Icon, { name: 'check', size: 16 }),
        h('div', null, h('strong', null, '检测到已安装的微信语音发送器'),
          h('p', null, '默认复用现有安装，不覆盖、不重复安装。版本：' + (sender.version || '未知') + '；健康接口：' + setupStateLabel(senderView.healthState) + '；服务健康：' + setupViewStateText(senderView.healthyState) + '。'),
          demo ? h('p', { className: 'wv-muted' }, '演示状态；真实升级/修复需要单独授权。') : null)) : h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'alert', size: 16 }),
        h('div', null, h('strong', null, installedUnknown ? '语音发送器安装状态未知' : '还没有安装微信语音发送器'),
          h('p', null, installedUnknown ? '没有足够的安装清单证据；不能据此判断已安装或未安装。' : '安装器 API 尚未接入 Core。当前不会下载、校验或执行任何安装包，也不会安装系统驱动。'))),
      sender && sender.vbCable === false ? h('div', { className: 'wv-setup-callout warn' },
        h(Icon, { name: 'volume', size: 16 }),
        h('div', null, h('strong', null, '还需要一个音频组件'),
          h('p', null, '才能让 AI 的声音进入微信录音。请按官方来源安装 VB-CABLE；安装驱动前必须由你确认。'))) : null,
      h('div', { className: 'wv-setup-plan' },
        h('div', { className: 'wv-setup-plan-head' }, h('strong', null, '安装计划预览'), h(Badge, { tone: 'wait' }, '未执行')),
        h('ol', null,
          h('li', null, '环境预检与版本检查'),
          h('li', null, '读取可信发布包并校验完整性'),
          h('li', null, '部署到临时目录，验证运行依赖'),
          h('li', null, '写入安全默认配置，连接 Core / WeChatAgent'),
          h('li', null, '健康检查与无真实发送的诊断'),
          h('li', null, '失败回滚，不覆盖现有配置'))),
      h('div', { className: 'wv-setup-actions' },
        h(Button, { variant: 'primary', disabled: true, title: '需要 Core Installer API；本阶段未实现' }, h(Icon, { name: 'lock', size: 14 }), installed ? '复用现有安装' : '一键安装微信语音功能'),
        h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), '重新检测'),
        h(Button, { variant: 'ghost', onClick: () => onNotify('组件管理将统一处理启动/停止/升级/修复/卸载；当前尚未接入 Core。', 'info') }, '组件管理'))))
}

function SetupProviderCard({ id, title, subtitle, state, selected, onSelect, demo, children }) {
  const stateLabel = state === 'soon' ? '即将支持' : demo ? '演示' : state === 'ready' ? '已检测' : '待配置'
  return h('button', {
    type: 'button', disabled: state === 'soon',
    className: 'wv-provider-card' + (selected ? ' selected' : '') + (state === 'soon' ? ' disabled' : ''),
    onClick: () => { if (state !== 'soon') onSelect(id) },
    'aria-pressed': selected,
  },
    h('div', { className: 'wv-provider-head' },
      h('strong', null, title),
      h('span', { className: 'wv-provider-state' }, stateLabel)),
    h('p', null, subtitle),
    children || null)
}

function SetupTtsStep({ data, demo, onRefresh, onNotify }) {
  const tts = data && data.tts
  const [provider, setProvider] = React.useState((tts && tts.provider) || 'local')
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' }, h(Icon, { name: 'spark', size: 22 })),
      h('div', null,
        h('h3', null, '选择小鲸鱼的声音'),
        h('p', null, '没有独立显卡也可以选择云端语音。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 不调用真实 TTS') : null)),
    data && data.ttsEvidence ? h(SetupEvidence, { data: data.ttsEvidence }) : null,
    h('div', { className: 'wv-provider-grid' },
      h(SetupProviderCard, { id: 'cloud', title: '云端 TTS', subtitle: '无需 CUDA 或本地大模型；需要 Provider 凭据。', state: 'soon', selected: provider === 'cloud', onSelect: setProvider, demo },
        h('span', { className: 'wv-provider-meta' }, '费用与文本上传第三方需确认')),
      h(SetupProviderCard, { id: 'local', title: '本地 Qwen', subtitle: '使用现有本地 Qwen3-TTS Provider；不强制普通用户下载模型。', state: tts && tts.available && tts.available.includes('qwen-local') ? 'ready' : 'wait', selected: provider === 'local', onSelect: setProvider, demo },
        h('span', { className: 'wv-provider-meta' }, tts && tts.provider === 'qwen-local' ? '已检测到本地 Provider' : '需本机 Qwen 服务')),
      h(SetupProviderCard, { id: 'custom', title: '自定义 TTS API', subtitle: '连接你已有的兼容语音服务，必须通过真实音频格式验证。', state: 'soon', selected: provider === 'custom', onSelect: setProvider, demo },
        h('span', { className: 'wv-provider-meta' }, '仅声明协议，不假设任意 OpenAI 地址可用'))),
    h('div', { className: 'wv-setup-credentials' },
      h('div', { className: 'wv-setup-field' },
        h('label', null, 'API Key'),
        h('input', { className: 'wv-input', disabled: true, placeholder: '由 Core 凭据管理；前端不保存、不输出', type: 'password', 'aria-label': 'API Key（未接入）' })),
      h('div', { className: 'wv-setup-field' },
        h('label', null, 'API 地址'),
        h('input', { className: 'wv-input', disabled: true, placeholder: 'Provider 配置接入后可用', 'aria-label': 'API 地址（未接入）' }))),
    h('div', { className: 'wv-setup-callout warn' },
      h(Icon, { name: 'lock', size: 16 }),
      h('div', null, h('strong', null, '密钥与试听尚未接入'),
        h('p', null, 'API Key 必须由后端安全凭据保存，不能写入 LocalStorage、日志或 GitHub。真实 Provider 未实现前，前端不会伪装试听成功。'))),
    h('div', { className: 'wv-setup-actions' },
      h(Button, { disabled: true, title: 'Provider Core 未接入' }, h(Icon, { name: 'play', size: 14 }), '生成试听'),
      h(Button, { variant: 'ghost', onClick: onRefresh }, h(Icon, { name: 'refresh', size: 14 }), '重新检测'),
      h(Button, { variant: 'ghost', onClick: () => onNotify('试听只调用 TTS，不调用 WeChatAgent 或 Voice Sender；当前未实现。', 'info') }, '试听说明')))
}

function SetupFinishStep({ data, demo, onClose, onGoPermissions, onNotify }) {
  const view = data ? deriveSetupView(data) : null
  const checks = view ? view.checks : []
  const complete = Boolean(view && view.complete)
  const voiceState = view && view.voice.enabled !== null
    ? (view.voice.enabled ? '已开启（需单独授权）' : '已关闭')
    : '未知（本次检测不会读取或修改）'
  return h(React.Fragment, null,
    h('div', { className: 'wv-setup-lead' },
      h('div', { className: 'wv-setup-lead-icon' + (complete ? ' ok' : '') }, h(Icon, { name: complete ? 'check' : 'alert', size: 22 })),
      h('div', null,
        h('h3', null, complete ? '小鲸鱼准备好了' : '还有一些步骤需要完成'),
        h('p', null, complete ? '所有真实检查通过。完成后仍需单独授权聊天目标和打开语音开关。' : '下面是当前检查结果；完成安装不等于自动开启微信语音。'),
        demo ? h(Badge, { tone: 'demo' }, '演示流程 · 不构成安装完成') : null)),
    data && data.evidence ? h(SetupEvidence, { data }) : null,
    h('div', { className: 'wv-setup-checks' },
      checks.length
        ? checks.map((c) => h(SetupMark, { key: c.id, state: c.state, label: c.label, value: setupViewStateText(c.state) }))
        : h(SetupMark, { state: 'unknown', label: 'Core 未连接', value: '无法检查' })),
    h('div', { className: 'wv-setup-callout ' + (complete ? 'ok' : 'warn') },
      h(Icon, { name: complete ? 'shield' : 'lock', size: 16 }),
      h('div', null, h('strong', null, complete ? '安全默认值仍然生效' : '安装成功不等于微信语音已开启'),
        h('p', null, '微信语音开关：' + voiceState + '。本次检测不修改私聊/群聊授权；群聊授权状态未读取，不能视为已通过或已关闭。不自动发送消息；不重放历史任务。聊天权限与语音开关需要你单独确认。'))),
    h('div', { className: 'wv-setup-actions' },
      h(Button, { variant: 'primary', onClick: onClose }, complete ? '进入 Whale Voice' : '稍后继续'),
      h(Button, { onClick: onGoPermissions }, '设置聊天权限'),
      h(Button, { variant: 'ghost', onClick: () => onNotify('诊断报告 API 尚未接入 Core；不会输出密钥或聊天内容。', 'info') }, '查看诊断报告')))
}

function SetupWizard({ open, status, onClose, onRefresh, onNotify, onGoPermissions }) {
  const [step, setStep] = React.useState(() => {
    try { return Math.max(0, Math.min(3, Number(sessionStorage.getItem('wv.setup.step')) || 0)) } catch { return 0 }
  })
  const [demo, setDemo] = React.useState(false)
  const realData = status && status.available && status.data && status.data.demo !== true ? status.data : null
  const data = demo ? MOCK_SETUP : realData
  const view = data ? deriveSetupView(data) : null
  const go = (next) => {
    setStep(next)
    try { sessionStorage.setItem('wv.setup.step', String(next)) } catch {}
  }
  if (!open) return null
  const nextEnabled = (() => {
    if (!view) return false
    if (demo) return true
    if (step === 0) return view.advance.wechat === true
    if (step === 1) return view.advance.sender === true
    if (step === 2) return view.advance.tts === true
    return view.advance.finish === true
  })()
  const footer = h(React.Fragment, null,
    h('span', { className: 'wv-setup-footnote' }, demo ? '演示模式：不执行真实安装、下载或微信操作' : '真实状态由 Whale Voice Core 提供'),
    h('span', { className: 'wv-spacer' }),
    step < 3 ? h(Button, { variant: 'ghost', onClick: onClose }, '稍后继续') : null,
    step > 0 ? h(Button, { onClick: () => go(step - 1) }, '上一步') : null,
    step < 3
      ? h(Button, { variant: 'primary', disabled: !nextEnabled, title: nextEnabled ? '' : '当前步骤的真实检查尚未通过', onClick: () => go(step + 1) }, '下一步')
      : h(Button, { variant: 'primary', onClick: onClose }, '关闭'))
  return h(Modal, {
    title: '首次安装向导', subtitle: demo ? '演示流程 · 不代表真实安装' : '连接微信 → 安装语音组件 → 选择 TTS → 完成诊断',
    size: 'lg', onClose, footer,
  },
    h(SetupStepNav, { step, setStep: go, maxStep: data ? 3 : 0 }),
    !data ? h(SetupBlocked, {
      status, onRefresh, onDemo: () => setDemo(true), onNotify,
    }) : null,
    data && step === 0 ? h(SetupWeChatStep, { data, demo, status, onRefresh, onNotify }) : null,
    data && step === 1 ? h(SetupSenderStep, { data, demo, status, onRefresh, onNotify }) : null,
    data && step === 2 ? h(SetupTtsStep, { data, demo, onRefresh, onNotify }) : null,
    data && step === 3 ? h(SetupFinishStep, { data, demo, onClose, onGoPermissions, onNotify }) : null,
    data && demo ? h('div', { className: 'wv-setup-demo-strip' }, h(Icon, { name: 'info', size: 13 }), h('span', null, '当前为演示数据，不会读取真实环境、安装组件或调用微信 / TTS。')) : null)
}

function ComponentsDialog({ open, status, onClose, onRefresh, onSetup, onAdvanced, onNotify }) {
  if (!open) return null
  const data = status && status.available && status.data && status.data.demo !== true ? status.data : null
  const view = data ? deriveSetupView(data) : null
  const rows = view ? view.components : [
    { name: 'Whale Voice Core', desc: '安装状态、任务与 API 协调', state: 'not_installed', detail: '未连接' },
    { name: 'WeChatAgent', desc: '微信平台必需依赖', state: 'not_installed', detail: '未检测' },
    { name: '微信语音发送器', desc: '独立 Voice Sender 组件', state: 'not_installed', detail: '未检测' },
    { name: 'TTS Provider', desc: '本地 / 云端 / 自定义', state: 'not_installed', detail: '未配置' },
  ]
  return h(Modal, {
    title: '组件管理', subtitle: '查看安装状态、重新检测或回到安装向导。不会直接执行系统命令。', size: 'lg', onClose,
    footer: h(React.Fragment, null,
      h(Button, { variant: 'ghost', onClick: onAdvanced }, '高级设置'),
      h(Button, { onClick: onRefresh, disabled: status.checking }, h(Icon, { name: 'refresh', size: 14 }), '重新检测'),
      h(Button, { variant: 'primary', onClick: onSetup }, '打开安装向导')),
  },
    !data ? h('div', { className: 'wv-setup-callout warn' }, h(Icon, { name: 'lock', size: 16 }), h('div', null, h('strong', null, 'Whale Voice Core 未连接'), h('p', null, '无法读取真实组件状态。当前不会把 Mock 显示成在线。'))) : null,
    h('div', { className: 'wv-component-list' }, rows.map((r) => h('div', { className: 'wv-component-row', key: r.name },
      h('div', { className: 'wv-component-main' }, h('strong', null, r.name), h('p', null, r.desc)),
      h('span', { className: 'wv-component-detail' }, r.detail),
      h(SetupStatusPill, { state: r.state, demo: Boolean(data && data.demo) })))),
    h('div', { className: 'wv-setup-callout' }, h(Icon, { name: 'info', size: 16 }), h('div', null, h('strong', null, '组件控制尚未开放'), h('p', null, '启动、停止、升级、修复、卸载必须通过 Core 的受控 API；本轮前端只展示状态和安装入口。'))) )
}

function SetupBanner({ status, onSetup, onComponents }) {
  if (status && status.checking) return null
  const data = status && status.available && status.data && status.data.demo !== true ? status.data : null
  const view = data ? deriveSetupView(data) : null
  const complete = Boolean(view && view.complete)
  const unavailable = !data
  return h('section', { className: 'wv-setup-banner' },
    h('div', { className: 'wv-setup-banner-icon' }, h(Icon, { name: unavailable ? 'lock' : complete ? 'check' : 'spark', size: 18 })),
    h('div', { className: 'wv-setup-banner-copy' },
      h('strong', null, unavailable ? '安装向导等待 Whale Voice Core' : complete ? '组件已就绪' : '首次设置还没有完成'),
      h('p', null, unavailable
        ? '不会用 LocalStorage 或 Mock 数据冒充安装成功。可以查看流程，真实检测和安装需要 Core。'
        : complete
          ? '组件状态来自 Core 检查；微信语音仍需单独授权目标并开启。'
          : '完成微信助手、微信语音发送器和 TTS 选择后，再进行真实诊断。')),
    h('div', { className: 'wv-setup-banner-actions' },
      h(Button, { variant: 'ghost', onClick: onComponents }, '组件管理'),
      h(Button, { variant: 'primary', onClick: onSetup }, unavailable ? '查看安装流程' : complete ? '重新打开向导' : '继续安装')))
}


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
      const [setupOpen, setSetupOpen] = React.useState(false)
      const [componentsOpen, setComponentsOpen] = React.useState(false)
      const autoSetupOpened = React.useRef(false)
      const setupScanGate = React.useRef(null)
      if (!setupScanGate.current) setupScanGate.current = createSetupScanGate()
      const dirty = JSON.stringify(settings) !== JSON.stringify(saved)

      const refreshSetup = async () => {
        const seq = setupScanGate.current.begin()
        setSetup((s) => ({ ...s, checking: true }))
        const next = await readSetupStatus()
        if (!setupScanGate.current.isCurrent(seq)) return next
        setSetup(next)
        if (next.available && next.data && next.data.completed === false && !autoSetupOpened.current) {
          autoSetupOpened.current = true
          setSetupOpen(true)
        }
        return next
      }

      React.useEffect(() => {
        let alive = true
        const seq = setupScanGate.current.begin()
        readSetupStatus().then((next) => {
          if (!alive || !setupScanGate.current.isCurrent(seq)) return
          setSetup(next)
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
      if (page === 'overview') body = h(OverviewPage, { settings, setSetting, setPage, notify, openService: setServiceDetail, openActivity: setActivityDetail, setup, onSetup: () => setSetupOpen(true), onComponents: () => setComponentsOpen(true) })
      else if (page === 'settings') body = h(SettingsPage, { settings, setSetting, dirty, saveSettings, resetSettings: () => setConfirmReset(true), notify, setup })
      else if (page === 'permissions') body = h(PermissionsPage, { contacts, setContacts, groups, addGroup, removeGroup, notify, setup })
      else if (page === 'studio') body = h(StudioPage, { preview, setPreview, notify, setup })
      else if (page === 'emotions') body = h(EmotionsPage, { emotion, setEmotion, notify })
      else if (page === 'activity') body = h(ActivityPage, { notify, openActivity: setActivityDetail })
      else if (page === 'advanced') body = h(AdvancedPage, { notify, setup, onSetup: () => setSetupOpen(true), onComponents: () => setComponentsOpen(true) })
      else body = h(OverviewPage, { settings, setSetting, setPage, notify, openService: setServiceDetail, openActivity: setActivityDetail, setup, onSetup: () => setSetupOpen(true), onComponents: () => setComponentsOpen(true) })

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
          open: true, status: setup, onClose: () => setComponentsOpen(false), onRefresh: refreshSetup,
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
