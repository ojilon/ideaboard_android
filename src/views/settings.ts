import { banners, bottomNav } from '../components/chrome';
import { backUpNow, importBoardFile, parseBoardFile, readFile } from '../lib/backup';
import { prepareImage } from '../lib/image';
import { formatDateLong } from '../lib/parse';
import { canInstall, isStandalone, onInstallChange, promptInstall } from '../lib/pwa';
import { store } from '../lib/store';
import { confirmSheet, el, icon, toast } from '../lib/ui';
import { navigate } from '../router';

const VERSION = '1.0.0';

function section(title: string, hint: string | null, children: (Node | null)[]): HTMLElement {
  return el('section', { class: 'section' }, [
    el('h2', { text: title }),
    hint ? el('p', { class: 'hint', text: hint }) : null,
    ...children,
  ]);
}

function switchRow(options: {
  title: string;
  sub: string;
  checked: boolean;
  label: string;
  onToggle: (next: boolean) => void;
}): HTMLElement {
  const toggle = el('button', {
    class: 'switch',
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(options.checked), 'aria-label': options.label },
  });
  toggle.addEventListener('click', () => {
    const next = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', String(next));
    options.onToggle(next);
  });
  return el('div', { class: 'row' }, [
    el('div', { class: 'grow' }, [el('div', { class: 'title', text: options.title }), el('div', { class: 'sub', text: options.sub })]),
    toggle,
  ]);
}

export function renderSettingsView(): { element: HTMLElement; cleanup: () => void } {
  const screen = el('div', { class: 'screen' });
  const topbar = el('header', { class: 'topbar' }, [el('h1', { text: 'Settings' })]);
  const content = el('div', { class: 'content' });
  const bannerParts = banners();
  content.append(bannerParts.element);
  screen.append(topbar, content, bottomNav('settings'));

  const cleanups: (() => void)[] = [bannerParts.cleanup];

  /* ------------------------------------------------------------------ theme */

  const lightButton = el('button', { attrs: { type: 'button' } }, [icon('sun'), 'Light']);
  const darkButton = el('button', { attrs: { type: 'button' } }, [icon('moon'), 'Dark']);
  const segmented = el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': 'Theme' } }, [
    lightButton,
    darkButton,
  ]);

  const syncTheme = () => {
    lightButton.setAttribute('aria-pressed', String(store.settings.theme === 'light'));
    darkButton.setAttribute('aria-pressed', String(store.settings.theme === 'dark'));
  };
  lightButton.addEventListener('click', () => {
    store.updateSettings({ theme: 'light' });
    syncTheme();
  });
  darkButton.addEventListener('click', () => {
    store.updateSettings({ theme: 'dark' });
    syncTheme();
  });
  syncTheme();

  /* ------------------------------------------------------------------- font */

  const fontSelect = el('select', { class: 'select', attrs: { 'aria-label': 'Note font' } });
  fontSelect.append(
    el('option', { attrs: { value: 'hand' }, text: 'Handwriting' }),
    el('option', { attrs: { value: 'sans' }, text: 'Friendly Sans' }),
  );
  fontSelect.value = store.settings.noteFont;
  fontSelect.addEventListener('change', () => {
    store.updateSettings({ noteFont: fontSelect.value === 'sans' ? 'sans' : 'hand' });
  });

  /* ------------------------------------------------------- background image */

  const bgSwatch = el('div', { class: 'swatch' });
  const bgLabel = el('div', { class: 'grow' }, [el('div', { class: 'title', text: 'Choose image' })]);
  const bgButton = el('button', { class: 'bg-picker', attrs: { type: 'button' } }, [
    bgSwatch,
    bgLabel,
    icon('chevron'),
  ]);

  let bgUrl: string | null = null;
  function syncBackground(): void {
    const blobId = store.settings.bgBlobId;
    if (bgUrl) {
      URL.revokeObjectURL(bgUrl);
      bgUrl = null;
    }
    bgSwatch.style.backgroundImage = '';
    if (!blobId) {
      bgLabel.replaceChildren(
        el('div', { class: 'title', text: 'Choose image' }),
        el('div', { class: 'sub', text: 'A photo behind your boards' }),
      );
      return;
    }
    bgUrl = store.getBlobUrl(blobId);
    if (bgUrl) bgSwatch.style.backgroundImage = `url("${bgUrl}")`;
    bgLabel.replaceChildren(
      el('div', { class: 'title', text: 'Change image' }),
      el('div', { class: 'sub', text: 'Shown behind the dot grid' }),
    );
  }
  syncBackground();
  cleanups.push(() => {
    if (bgUrl) URL.revokeObjectURL(bgUrl);
  });

  bgButton.addEventListener('click', () => {
    const input = el('input', { class: 'visually-hidden', attrs: { type: 'file', accept: 'image/*' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void (async () => {
        try {
          toast('Setting background…');
          const prepared = await prepareImage(file, 1600);
          const previous = store.settings.bgBlobId;
          const blobId = store.addBlob(prepared.blob, prepared.mime);
          store.updateSettings({ bgBlobId: blobId });
          if (previous) store.deleteBlob(previous);
          await store.saveNow();
          syncBackground();
          removeBg.style.display = 'flex';
          toast('Background set');
        } catch {
          toast('Could not use that image');
        }
      })();
    });
    document.body.append(input);
    input.click();
  });

  const removeBg = el('button', { class: 'btn ghost block', attrs: { type: 'button' }, text: 'Remove background image' });
  removeBg.addEventListener('click', () => {
    const previous = store.settings.bgBlobId;
    store.updateSettings({ bgBlobId: null });
    if (previous) store.deleteBlob(previous);
    syncBackground();
    removeBg.style.display = 'none';
    toast('Background removed');
  });
  removeBg.style.display = store.settings.bgBlobId ? 'flex' : 'none';

  const dimRange = el('input', {
    class: 'range',
    attrs: { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Background opacity' },
  });
  dimRange.value = String(Math.round(store.settings.bgDim * 100));
  const dimOutput = el('output', { text: `${Math.round(store.settings.bgDim * 100)}%` });
  dimRange.addEventListener('input', () => {
    const value = Number(dimRange.value) / 100;
    dimOutput.textContent = `${dimRange.value}%`;
    store.updateSettings({ bgDim: value });
  });

  /* ----------------------------------------------------------------- backup */

  const backupButton = el('button', { class: 'btn block', attrs: { type: 'button' } }, [icon('download'), 'Back up now']);
  backupButton.addEventListener('click', () => {
    void (async () => {
      await backUpNow();
      lastBackupText.textContent = `Last backup: ${formatDateLong(Date.now())}`;
      toast('Backup downloaded');
    })();
  });
  const lastBackupText = el('p', {
    class: 'small center',
    text: store.settings.lastBackupAt
      ? `Last backup: ${formatDateLong(store.settings.lastBackupAt)}`
      : 'No backup yet. One JSON file holds everything.',
    style: { marginTop: '10px' },
  });

  /* -------------------------------------------------------------- persistence */

  const persistenceStatus = el('div', { class: 'sub' });
  const persistenceToggle = el('button', {
    class: 'switch',
    attrs: { type: 'button', role: 'switch', 'aria-label': 'Persistent storage' },
  });
  const syncPersistence = () => {
    const state = store.storagePersisted;
    persistenceToggle.setAttribute('aria-checked', String(state === true));
    persistenceStatus.textContent =
      state === null
        ? 'Checking…'
        : state
          ? 'On — the browser will not evict your boards.'
          : 'Off — the browser may clear data if the device runs low.';
  };
  persistenceToggle.addEventListener('click', () => {
    if (store.storagePersisted) {
      toast('Already granted by the browser');
      return;
    }
    void store.requestPersistence().then((granted) => {
      syncPersistence();
      toast(granted ? 'Persistent storage granted' : 'The browser did not grant persistent storage');
    });
  });
  syncPersistence();
  void store.refreshPersistence().then(syncPersistence);

  const usageText = el('p', { class: 'small', text: 'Checking storage use…' });
  const refreshUsage = () => {
    void store.estimate().then((estimate) => {
      if (!estimate || !estimate.quota) {
        usageText.textContent = '';
        return;
      }
      const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      usageText.textContent = `${mb(estimate.usage)} used of about ${mb(estimate.quota)} available.`;
    });
  };
  refreshUsage();

  /* ---------------------------------------------------------------- previews */

  const previewInfo = el('p', { class: 'small', text: '' });
  const syncPreview = () => {
    previewInfo.textContent = store.settings.previewEnabled
      ? 'On — saved URLs are sent to noembed.com (a public oEmbed service) to look for a title. X posts usually have no preview, and nothing else leaves the device.'
      : 'Off — no network requests. A card shows the domain, your title and your note.';
  };
  const previewRow = switchRow({
    title: 'Link previews',
    sub: 'Optional, off by default',
    checked: store.settings.previewEnabled,
    label: 'Link previews',
    onToggle: (next) => {
      store.updateSettings({ previewEnabled: next });
      syncPreview();
    },
  });
  syncPreview();

  /* ------------------------------------------------------------------- data */

  const importButton = el('button', { class: 'btn ghost block', attrs: { type: 'button' } }, [icon('upload'), 'Import from file']);
  importButton.addEventListener('click', () => {
    const input = el('input', { class: 'visually-hidden', attrs: { type: 'file', accept: 'application/json,.json' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void (async () => {
        try {
          const parsed = parseBoardFile(await readFile(file));
          const confirmed = await confirmSheet({
            title: 'Replace everything?',
            message: `This backup has ${parsed.boards.length} boards. Importing replaces all boards and links on this device. Back up first if you need the current data.`,
            confirmLabel: 'Import and replace',
            danger: true,
          });
          if (!confirmed) return;
          const summary = await importBoardFile(parsed);
          toast(`Imported ${summary.boards} boards, ${summary.links} links`);
          navigate('#/boards');
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Import failed');
        }
      })();
    });
    document.body.append(input);
    input.click();
  });

  /* ------------------------------------------------------------------ install */

  const installSection = el('div');
  const renderInstall = () => {
    installSection.replaceChildren();
    if (isStandalone()) {
      installSection.append(el('p', { class: 'small', text: 'Installed — running from your home screen.' }));
      return;
    }
    if (canInstall()) {
      const button = el('button', { class: 'btn block', attrs: { type: 'button' }, text: 'Add to Home screen' });
      button.addEventListener('click', () => {
        void promptInstall().then((accepted) => {
          toast(accepted ? 'Installing…' : 'Install dismissed');
          renderInstall();
        });
      });
      installSection.append(button);
      return;
    }
    installSection.append(
      el('p', {
        class: 'small',
        text: 'Open this page in Chrome on Android, then use the ⋮ menu → “Add to Home screen”. Install needs HTTPS (or localhost).',
      }),
    );
  };
  renderInstall();
  cleanups.push(onInstallChange(renderInstall));

  /* ------------------------------------------------------------------- build */

  content.append(
    section('Theme', 'Choose how Ideaboard looks.', [segmented]),
    section('Font', 'Choose the font for your notes. No fonts are downloaded.', [fontSelect]),
    section('Background image', 'Set a background for your boards.', [
      bgButton,
      removeBg,
      el('div', { class: 'range-row', style: { marginTop: '14px' } }, [dimRange, dimOutput]),
    ]),
    el('hr', { class: 'divider' }),
    section('Backup', 'Everything lives in this browser. A backup file is your safety net.', [
      backupButton,
      lastBackupText,
    ]),
    section('Storage', null, [
      el('div', { class: 'row' }, [
        icon('db'),
        el('div', { class: 'grow' }, [
          el('div', { class: 'title', text: 'Persistent storage' }),
          persistenceStatus,
        ]),
        persistenceToggle,
      ]),
      usageText,
    ]),
    section('Link previews', null, [previewRow, previewInfo]),
    section('Data', null, [importButton,
      el('p', {
        class: 'small',
        text: 'Exports are plain versioned JSON, so they open in the PC app too.',
        style: { marginTop: '10px' },
      }),
    ]),
    section('Install', null, [installSection]),
    section('About', null, [
      el('p', {
        class: 'small',
        text: `Ideaboard ${VERSION} · local-first, no accounts, no analytics. Boards are stored in IndexedDB on this device.`,
      }),
    ]),
  );
  removeBg.style.display = store.settings.bgBlobId ? 'flex' : 'none';

  return {
    element: screen,
    cleanup: () => {
      for (const cleanup of cleanups) cleanup();
    },
  };
}
