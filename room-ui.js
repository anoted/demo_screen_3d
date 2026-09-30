/* Floating panels and modal dialogs (UX 8.2), styled after 3d_projection_demo-master. */
(function (root) {
  const KEY = 'concave-room-ui-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };

  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) node.append(kid);
    return node;
  }

  // A small floating window: title bar (drag to move, click to collapse) and a body.
  function panel({ id, title, x, y, width = 240, open = true, collapsible = true }) {
    const pos = saved[id] || {};
    const body = el('div', { class: 'fp-body' });
    const label = el('span', { class: 'fp-title', text: title });
    const head = el('div', { class: 'fp-head' }, label, collapsible ? el('span', { class: 'fp-chev', 'aria-hidden': 'true' }) : null);
    const node = el('section', { class: 'fp', id: 'panel-' + id, style: `left:${pos.x ?? x}px;top:${pos.y ?? y}px;width:${width}px` }, head, body);
    const api = { el: node, body, title: label, open: pos.open ?? open, listeners: [] };
    const apply = () => { node.classList.toggle('collapsed', !api.open); api.listeners.forEach(f => f(api.open)); };
    api.setOpen = value => { api.open = value; saved[id] = { ...saved[id], open: value }; persist(); apply(); };
    let drag = null, moved = false;
    head.addEventListener('pointerdown', event => {
      drag = { px: event.clientX, py: event.clientY, x: node.offsetLeft, y: node.offsetTop }; moved = false; head.setPointerCapture(event.pointerId);
    });
    head.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX-drag.px, dy = event.clientY-drag.py;
      if (Math.abs(dx)+Math.abs(dy) > 4) moved = true;
      if (moved) { node.style.left = Math.max(0, Math.min(innerWidth-60, drag.x+dx))+'px'; node.style.top = Math.max(0, Math.min(innerHeight-24, drag.y+dy))+'px'; }
    });
    head.addEventListener('pointerup', () => {
      if (!drag) return;
      if (moved) { saved[id] = { ...saved[id], x: node.offsetLeft, y: node.offsetTop }; persist(); }
      else if (collapsible) api.setOpen(!api.open);
      drag = null;
    });
    apply(); document.body.append(node);
    return api;
  }

  // Modal dialog with a step list on the left (reference calibration-dialog style). Esc closes.
  function dialog({ title, steps, onClose }) {
    const content = el('div', { class: 'dlg-content' }), nav = el('nav', { class: 'dlg-steps' });
    const backdrop = el('div', { class: 'dlg-back' });
    const close = () => { document.removeEventListener('keydown', onKey, true); backdrop.remove(); onClose?.(); };
    const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    const box = el('div', { class: 'dlg', role: 'dialog', 'aria-label': title },
      el('div', { class: 'dlg-head' }, el('b', { text: title }), el('button', { class: 'dlg-x', text: '×', 'aria-label': 'Close', onclick: close })),
      el('div', { class: 'dlg-main' }, steps ? nav : null, content));
    backdrop.append(box); document.body.append(backdrop); document.addEventListener('keydown', onKey, true);
    const buttons = [];
    const api = { content, close, root: box, step: 0 };
    api.go = index => {
      api.step = index; buttons.forEach((b, i) => { b.classList.toggle('on', i === index); });
      content.replaceChildren(); steps[index].render(content, api);
    };
    if (steps) { steps.forEach((s, i) => { const b = el('button', { text: `${i+1}  ${s.title}`, onclick: () => api.go(i) }); buttons.push(b); nav.append(b); }); api.go(0); }
    return api;
  }
  root.RoomUI = { el, panel, dialog };
})(window);
