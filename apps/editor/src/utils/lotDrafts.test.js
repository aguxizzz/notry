// Tests for the lot draft helpers: server draft mapping, saved-snapshot ordering and
// reconciling an old local draft with what the server has now.
import { describe, expect, it } from 'vitest';
import { draftToAnnotation, insertIntoSaved, reconcileRestoredDrafts } from './lotDrafts';

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
});
