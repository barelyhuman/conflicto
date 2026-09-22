/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';

const getFileContents = vi.fn();

vi.mock('../wails.js', () => ({
  api: {
    getFileContents: (...args) => getFileContents(...args),
  },
}));

vi.mock('../components/fileEditorCaret.js', () => ({
  bindEditorClickCaret: () => () => {},
}));

const { FileEditorModel } = await import('./fileEditor.js');

describe('FileEditorModel', () => {
  /** @type {InstanceType<typeof FileEditorModel>} */
  let model;

  beforeEach(() => {
    getFileContents.mockReset();
    getFileContents.mockResolvedValue({
      hasNew: true,
      newContent: 'hello',
      hasOld: false,
      oldContent: '',
    });
  });

  afterEach(() => {
    model?.[Symbol.dispose]?.();
  });

  it('loads file contents for the current path', async () => {
    const path = signal('src/a.js');
    const editorDirty = signal(false);
    model = new FileEditorModel({ path, editorDirty });

    await vi.waitFor(() => {
      expect(model.file.peek()).not.toBeNull();
    });
    expect(model.file.peek()?.contents).toBe('hello');
    expect(model.loadError.peek()).toBeNull();
    expect(editorDirty.peek()).toBe(false);
  });

  it('clears file and dirty when path becomes null', async () => {
    const path = signal('src/a.js');
    const editorDirty = signal(false);
    model = new FileEditorModel({ path, editorDirty });

    await vi.waitFor(() => {
      expect(model.file.peek()).not.toBeNull();
    });

    path.value = null;
    expect(model.file.peek()).toBeNull();
    expect(editorDirty.peek()).toBe(false);
  });
});
