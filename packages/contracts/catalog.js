/** Pure UI model: no filesystem, credentials, approval logic or DOM. */
export function filterCards(cards, { grade = '', unit = '', query = '' } = {}) {
  const words = query.normalize('NFKC').trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
  return cards.filter(card => (!grade || String(card.grade) === grade) && (!unit || card.unit === unit) &&
    words.every(word => [card.title, card.unit, card.summary, ...card.concepts].join(' ').normalize('NFKC').toLocaleLowerCase('ko').includes(word)));
}

export function stateFromSearch(search, config) {
  const params = new URLSearchParams(search);
  const grade = config.grades.some(g => String(g.value) === params.get('grade')) ? params.get('grade') : '';
  const unit = config.units.some(u => u.label === params.get('unit') && (!grade || String(u.grade) === grade)) ? params.get('unit') : '';
  return { grade: grade || '', unit: unit || '', query: (params.get('q') || '').slice(0, 150) };
}
