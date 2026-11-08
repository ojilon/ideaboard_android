/** Tiny DOM helpers: elements, icons, sheets, menus, toasts. No framework. */

export type Child = Node | string | null | undefined | false;

type Props = {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  style?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: never) => void>>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.title) node.title = props.title;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, String(value));
    }
  }
  if (props.style) Object.assign(node.style, props.style);
  if (props.on) {
    for (const [type, handler] of Object.entries(props.on)) {
      node.addEventListener(type, handler as EventListener);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/* --------------------------------------------------------------------- icons */

const ICONS = {
  back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  more: '<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7-4 1 1-4z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>',
  region: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 2.5-2.5L20 18"/>',
  connect: '<circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="17" r="2.4"/><path d="M8 8.6 16 15.4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  eraser: '<path d="m4 15 6-6 7 7-4 4H7z"/><path d="M9 20h11"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  boards: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="10" rx="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M4 18h16"/>',
  upload: '<path d="M12 20V10"/><path d="m8 14 4-4 4 4"/><path d="M4 5h16"/>',
  tag: '<path d="M20 12.5 12.5 20a2 2 0 0 1-2.8 0L3 13.3V4h9.3l7.7 7.7a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="8" r="1.3" fill="currentColor" stroke="none"/>',
  inbox: '<path d="M4 13h4l1.5 2.5h5L16 13h4"/><path d="M5.6 5.5 3.2 12v6.5h17.6V12l-2.4-6.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
  gallery: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 17 5-5 4 4 2-2 5 5"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  select: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="4 3"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = ''): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICONS[name]}</svg>`;
  return template.content.firstElementChild as SVGElement;
}

export function iconButton(name: IconName, label: string, onClick: () => void, cls = 'icon-btn'): HTMLButtonElement {
  const button = el('button', { class: cls, attrs: { type: 'button', 'aria-label': label, title: label } }, [icon(name)]);
  button.addEventListener('click', onClick);
  return button;
}

/* -------------------------------------------------------------------- sheets */

let openSheetEl: HTMLElement | null = null;
let sheetCleanup: (() => void) | null = null;

export function closeSheet(): void {
  if (!openSheetEl) return;
  openSheetEl.remove();
  openSheetEl = null;
  sheetCleanup?.();
  sheetCleanup = null;
  document.body.style.overflow = '';
}

export type SheetOptions = {
  title?: string;
  subtitle?: string;
  content: HTMLElement;
  actions?: HTMLElement[];
  onClose?: () => void;
  autofocus?: HTMLElement;
};

export function openSheet(options: SheetOptions): HTMLElement {
  closeSheet();
  const sheet = el('div', { class: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
    el('div', { class: 'sheet-handle' }),
    options.title ? el('h2', { text: options.title }) : null,
    options.subtitle ? el('p', { class: 'subtitle', text: options.subtitle }) : null,
    options.content,
    options.actions && options.actions.length ? el('div', { class: 'sheet-actions' }, options.actions) : null,
  ]);

  const backdrop = el('div', { class: 'sheet-backdrop', attrs: { role: 'presentation' } }, [sheet]);
  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) {
      closeSheet();
      options.onClose?.();
    }
  });

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeSheet();
      options.onClose?.();
    }
  };
  document.addEventListener('keydown', onKey);
  sheetCleanup = () => document.removeEventListener('keydown', onKey);
  document.body.append(backdrop);
  openSheetEl = backdrop;
  document.body.style.overflow = 'hidden';
  if (options.autofocus) {
    setTimeout(() => options.autofocus?.focus(), 50);
  }
  return sheet;
}

export function promptSheet(options: {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  onConfirm: (value: string) => void;
}): void {
  const input = options.multiline
    ? el('textarea', { class: 'textarea', attrs: { placeholder: options.placeholder ?? '' } })
    : el('input', { class: 'input', attrs: { type: 'text', placeholder: options.placeholder ?? '' } });
  input.value = options.value ?? '';
  const content = el('div', {}, [
    el('div', { class: 'field' }, [options.label ? el('label', { text: options.label }) : null, input]),
  ]);
  const cancel = el('button', { class: 'btn quiet block', attrs: { type: 'button' }, text: 'Cancel' });
  const confirm = el('button', { class: 'btn block', attrs: { type: 'button' }, text: options.confirmLabel ?? 'Save' });
  cancel.addEventListener('click', () => closeSheet());
  confirm.addEventListener('click', () => {
    const value = input.value;
    closeSheet();
    options.onConfirm(value);
  });
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !options.multiline) {
      event.preventDefault();
      confirm.click();
    }
  };
  input.addEventListener('keydown', onKey as EventListener);
  openSheet({ title: options.title, content, actions: [confirm, cancel], autofocus: input });
}

export function confirmSheet(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const content = el('p', { class: 'small', text: options.message });
    const cancel = el('button', { class: 'btn quiet block', attrs: { type: 'button' }, text: 'Cancel' });
    const confirm = el('button', {
      class: options.danger ? 'btn danger block' : 'btn block',
      attrs: { type: 'button' },
      text: options.confirmLabel ?? 'Continue',
    });
    cancel.addEventListener('click', () => {
      closeSheet();
      resolve(false);
    });
    confirm.addEventListener('click', () => {
      closeSheet();
      resolve(true);
    });
    openSheet({ title: options.title, content, actions: [confirm, cancel], onClose: () => resolve(false) });
  });
}

/* --------------------------------------------------------------------- menus */

export type MenuEntry =
  | {
      label: string;
      icon?: IconName;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | 'separator';

export function openMenu(anchor: HTMLElement, entries: MenuEntry[]): void {
  const menu = el('div', { class: 'menu', attrs: { role: 'menu' } });
  for (const entry of entries) {
    if (entry === 'separator') {
      menu.append(el('hr'));
      continue;
    }
    const button = el(
      'button',
      {
        class: entry.danger ? 'danger' : '',
        attrs: { type: 'button', role: 'menuitem', disabled: entry.disabled ?? false },
      },
      [entry.icon ? icon(entry.icon) : null, entry.label],
    );
    button.addEventListener('click', () => {
      close();
      entry.onSelect();
    });
    menu.append(button);
  }

  const backdrop = el('div', { class: 'menu-backdrop' }, [menu]);
  const close = () => {
    backdrop.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  };
  const onOutside = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) close();
  };
  document.body.append(backdrop);

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  let left = Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - margin);
  left = Math.max(margin, left);
  let top = rect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - menuRect.height - 6);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.position = 'fixed';

  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
  }, 0);
}

/* -------------------------------------------------------------------- toasts */

export function toast(
  message: string,
  options: { actionLabel?: string; onAction?: () => void; duration?: number } = {},
): void {
  let wrap = document.querySelector<HTMLElement>('.toast-wrap');
  if (!wrap) {
    wrap = el('div', { class: 'toast-wrap', attrs: { role: 'status', 'aria-live': 'polite' } });
    document.body.append(wrap);
  }
  const node = el('div', { class: 'toast' }, [el('span', { text: message })]);
  if (options.actionLabel && options.onAction) {
    const action = el('button', { attrs: { type: 'button' }, text: options.actionLabel });
    action.addEventListener('click', () => {
      node.remove();
      options.onAction?.();
    });
    node.append(action);
  }
  wrap.append(node);
  const duration = options.duration ?? (options.actionLabel ? 5200 : 2400);
  setTimeout(() => node.remove(), duration);
}

export function haptic(pattern: number | number[] = 8): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported — fine */
  }
}
