// Gamepad navigation and native DOM focus can disagree while Steam scrolls.
// Keep one visual owner per document instead of painting every stale .gpfocus.
const owners = new WeakMap<Document, HTMLElement>();

export function focusMediaRow(row: HTMLElement | null) {
  if (!row) return;
  const previous = owners.get(row.ownerDocument);
  if (previous !== row) previous?.removeAttribute('data-ytm-row-focused');
  owners.set(row.ownerDocument, row);
  row.setAttribute('data-ytm-row-focused', 'true');
}

export function blurMediaRow(row: HTMLElement | null) {
  if (!row) return;
  row.removeAttribute('data-ytm-row-focused');
  if (owners.get(row.ownerDocument) === row) owners.delete(row.ownerDocument);
}
