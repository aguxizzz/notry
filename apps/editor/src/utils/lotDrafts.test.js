// Tests for the lot draft helpers: server draft mapping, saved-snapshot ordering and
// reconciling an old local draft with what the server has now.
import { describe, expect, it } from 'vitest';
import { draftToAnnotation, insertIntoSaved, mergeServerChanges, reconcileRestoredDrafts } from './lotDrafts';

const SQUARE = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]];

describe('draftToAnnotation', () => {
  it('builds a pending blueprint lot that keeps the server id', () => {
    const ann = draftToAnnotation({ id: 'abc', blueprint_coordinates: SQUARE, label: 'Lote Auto 3' });
    expect(ann).toMatchObject({ id: 'draft-abc', draftId: 'abc', pending: true, tooltip: 'Lote Auto 3' });
    expect(ann.blueprint_coordinates).toEqual(SQUARE);
  });
});

describe('insertIntoSaved', () => {
  it('goes after the saved annotations that precede it on screen', () => {
    const saved = [{ id: 'a' }, { id: 'c' }];
    const onScreen = [{ id: 'a' }, { id: 'x' }, { id: 'new' }, { id: 'c' }];
    expect(insertIntoSaved(saved, { id: 'new' }, onScreen, 'new').map(a => a.id)).toEqual(['a', 'new', 'c']);
  });

  it('goes at the end when the id is not on screen anymore', () => {
    const saved = [{ id: 'a' }];
    expect(insertIntoSaved(saved, { id: 'new' }, [{ id: 'a' }], 'new').map(a => a.id)).toEqual(['a', 'new']);
  });
});

describe('reconcileRestoredDrafts', () => {
  const server = [{ id: 'draft-1', draftId: '1' }, { id: 'draft-3', draftId: '3' }];

  it('drops pendings whose server draft is gone and appends new ones', () => {
    const restored = [
      { id: 'lot-a', uuid: 'a' },
      { id: 'draft-1', draftId: '1', tooltip: 'edited locally' },
      { id: 'draft-2', draftId: '2' },
      { id: 'local-pending', pending: true },
    ];
    const result = reconcileRestoredDrafts(restored, server);
    expect(result.map(a => a.id)).toEqual(['lot-a', 'draft-1', 'local-pending', 'draft-3']);
    // The local edit of a draft that still exists wins over the server copy.
    expect(result[1].tooltip).toBe('edited locally');
  });

  it('brings back lots created on the back after the local copy was taken', () => {
    const restored = [{ id: 'a', uuid: 'a', type: 'polygon', tooltip: 'edited locally' }];
    const serverLots = [
      { id: 'a', uuid: 'a', type: 'polygon' },
      { id: 'mcp', uuid: 'mcp', type: 'polygon' },
      { id: 'poi-1', type: 'poi' },
    ];
    const result = reconcileRestoredDrafts(restored, [], serverLots);
    expect(result.map(a => a.id)).toEqual(['a', 'mcp']);
    expect(result[0].tooltip).toBe('edited locally');
  });
});

describe('mergeServerChanges', () => {
  const lot = id => ({ id, uuid: id, type: 'polygon' });
  const pending = draftId => ({ id: `draft-${draftId}`, draftId, type: 'polygon', pending: true });

  it('returns null when the back has nothing new', () => {
    const annotations = [lot('a'), pending('1')];
    expect(mergeServerChanges(annotations, annotations, { serverDrafts: [pending('1')], serverLots: null })).toBeNull();
  });

  it('swaps a draft filled in elsewhere for its new lot, on screen and in the saved snapshot', () => {
    const annotations = [lot('a'), pending('1'), pending('2')];
    const saved = [lot('a'), pending('1'), pending('2')];
    const result = mergeServerChanges(annotations, saved, {
      serverDrafts: [pending('2')],
      serverLots: [lot('a'), lot('new')],
    });
    expect(result.annotations.map(a => a.id)).toEqual(['a', 'draft-2', 'new']);
    expect(result.saved.map(a => a.id)).toEqual(['a', 'draft-2', 'new']);
    expect(result).toMatchObject({ goneIds: ['draft-1'], createdLots: 1, discardedDrafts: 0 });
  });

  it('keeps unsaved edits of everything else untouched', () => {
    const edited = { ...lot('a'), tooltip: 'unsaved' };
    const result = mergeServerChanges([edited, pending('1')], [lot('a'), pending('1')], {
      serverDrafts: [], serverLots: [lot('a')],
    });
    expect(result.annotations).toEqual([edited]);
    expect(result.saved).toEqual([lot('a')]);
    expect(result.discardedDrafts).toBe(1);
  });

  it('appends drafts created elsewhere and ignores local pendings with no draft yet', () => {
    const local = { id: 'tmp', type: 'polygon', pending: true };
    const result = mergeServerChanges([local], [], { serverDrafts: [pending('9')], serverLots: null });
    expect(result.annotations.map(a => a.id)).toEqual(['tmp', 'draft-9']);
    expect(result.newDrafts).toBe(1);
  });
});
