import { filterCards, stateFromSearch } from '@science/contracts/catalog';

type Card = { id:string; title:string; grade:number; unit:string; summary:string; concepts:string[]; href:string };
type Catalog = {schemaVersion:number; basePath:string; grades:{value:number;label:string}[]; units:{grade:number;label:string}[]; cards:Card[]};
type Filters = {grade:string;unit:string;query:string};
const get = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const form = get<HTMLFormElement>('filters');
const query = get<HTMLInputElement>('query');
const unit = get<HTMLSelectElement>('unit');
let catalog:Catalog;
let state:Filters = {grade:'',unit:'',query:''};
function element<K extends keyof HTMLElementTagNameMap>(tag:K, text?:string, className?:string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function syncControls() {
  query.value = state.query;
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name=grade]')) radio.checked = radio.value === state.grade;
  unit.replaceChildren(new Option('전체 단원',''));
  const units = [...new Set(catalog.units.filter(u => !state.grade || String(u.grade) === state.grade).map(u => u.label))];
  for (const label of units) unit.add(new Option(label,label));
  if (!units.includes(state.unit)) state.unit = '';
  unit.value = state.unit;
}
function render(writeUrl = true) {
  syncControls();
  const cards:Card[] = filterCards(catalog.cards,state);
  const active = Boolean(state.grade || state.unit || state.query.trim());
  get('count').textContent = String(cards.length);
  get('result-status').textContent = `전체 ${catalog.cards.length}개 중 ${cards.length}개 자료`;
  const list = get('cards');
  list.replaceChildren();
  for (const card of cards) {
    const item = element('article',undefined,'card');
    item.append(element('p',`${catalog.grades.find(g => g.value === card.grade)?.label} · ${card.unit}`,'card-label'));
    item.append(element('h3',card.title),element('p',card.summary,'card-description'));
    const tags = element('ul',undefined,'tags');
    tags.setAttribute('aria-label','주요 개념');
    for (const concept of card.concepts) tags.append(element('li',concept));
    const link = element('a','탐구 시작하기');
    // Only generated same-origin content paths are accepted, even if data is corrupted.
    if (!card.href.startsWith(`${catalog.basePath}simulations/${card.id}/`) || /[\\%?#]/.test(card.href) || card.href.includes('..')) throw new Error('INVALID_CARD_URL');
    link.href = card.href;
    link.setAttribute('aria-label',`${card.title} 탐구 시작하기`);
    const arrow = element('span','↗'); arrow.setAttribute('aria-hidden','true'); link.append(arrow);
    item.append(tags,link); list.append(item);
  }
  get('empty').hidden = cards.length !== 0;
  get('empty-reset').hidden = !active;
  get('empty-title').textContent = catalog.cards.length ? '조건에 맞는 자료가 없어요.' : '첫 탐구 자료를 준비하고 있어요.';
  get('empty-description').replaceChildren();
  const description = get('empty-description');
  if (catalog.cards.length) description.textContent = '검색어를 바꾸거나 조건을 초기화해 보세요.';
  else description.append('검토를 마친 자료부터 차근차근 소개할게요.',element('br'),'지금은 공개된 시뮬레이션이 없습니다.');
  if (writeUrl) {
    const params = new URLSearchParams();
    if (state.grade) params.set('grade',state.grade);
    if (state.unit) params.set('unit',state.unit);
    if (state.query) params.set('q',state.query);
    history.replaceState(null,'',location.pathname + (params.size ? `?${params}` : '') + location.hash);
  }
}
async function load() {
  get('error').hidden = true;
  get('empty').hidden = true;
  get('result-status').textContent = '자료를 불러오는 중입니다.';
  try {
    const base = new URL('../',import.meta.url).pathname;
    const response = await fetch(`${base}catalog.json`);
    if (!response.ok) throw new Error('LOAD_FAILED');
    catalog = await response.json();
    if (catalog.schemaVersion !== 1 || catalog.basePath !== base || !Array.isArray(catalog.cards)) throw new Error('INVALID_CATALOG');
    state = stateFromSearch(location.search,catalog);
    const grades = get('grade-options'); grades.replaceChildren();
    for (const grade of [{value:'',label:'전체'},...catalog.grades.map(g => ({value:String(g.value),label:g.label}))]) {
      const label = element('label',undefined,'grade-option');
      const input = element('input'); input.type = 'radio'; input.name = 'grade'; input.value = grade.value;
      label.append(input,element('span',grade.label)); grades.append(label);
    }
    render(false);
  } catch {
    get('cards').replaceChildren(); get('empty').hidden = true; get('error').hidden = false;
    get('result-status').textContent = '불러오기 실패';
  }
}
form.addEventListener('submit',event => { event.preventDefault(); if(catalog) {state.query = query.value; render();} });
query.addEventListener('input',() => {if(catalog) {state.query = query.value; render();}});
form.addEventListener('change',event => {
  if(!catalog) return;
  const target = event.target as HTMLInputElement;
  if(target.name === 'grade') { state.grade = target.value; state.unit = ''; }
  else if(target.id === 'unit') state.unit = target.value;
  else return; // Search input already rendered; blur must not replace a clicked card.
  render();
});
function reset() { if(catalog) {state = {grade:'',unit:'',query:''}; render(); query.focus();} }
get('reset').addEventListener('click',reset);
get('empty-reset').addEventListener('click',reset);
get('retry').addEventListener('click',load);
window.addEventListener('popstate',() => {if(catalog) {state = stateFromSearch(location.search,catalog); render(false);}});
void load();
