import { cross, sample, MAX_SAMPLES } from './model.js';
const $ = (id) => document.getElementById(id);
const names = { round: '둥근 씨', wrinkled: '주름진 씨', roundYellow: '둥근 · 노란 씨', roundGreen: '둥근 · 초록 씨', wrinkledYellow: '주름진 · 노란 씨', wrinkledGreen: '주름진 · 초록 씨' };
const titles = ['부모의 대립유전자', '생식세포로 나뉘기', '수정으로 다시 만나기', '자손의 유전자형과 표현형'];
let step = 0, timer = null, observed = { count: 0, genotypes: {}, phenotypes: {}, last: null };
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const parents = () => [$('parent-a').value, $('parent-b').value];
const theory = () => cross(...parents());
const percent = (n) => `${Number((n * 100).toFixed(2))}%`;
function stop() { if (timer !== null) clearInterval(timer); timer = null; $('play').disabled = step === 3; $('pause').disabled = true; }
function resetData(message) {
  stop(); step = 0; observed = { count: 0, genotypes: {}, phenotypes: {}, last: null };
  $('prediction').value = ''; $('explanation').value = ''; $('show-cross').checked = false;
  $('status').textContent = message; render();
}
function setupMode() {
  const mode = $('mode').value;
  for (const [id, initial] of [['parent-a', mode === 'dominance' ? 'RR' : mode === 'independence' ? 'RrYy' : 'Rr'], ['parent-b', mode === 'dominance' ? 'rr' : mode === 'independence' ? 'RrYy' : 'Rr']]) {
    const options = mode === 'independence' ? ['RrYy'] : ['RR', 'Rr', 'rr'];
    $(id).replaceChildren(...options.map((value) => { const option = el('option', value); option.value = value; return option; }));
    $(id).value = initial; $(id).disabled = mode !== 'segregation';
  }
  $('mode-note').textContent = mode === 'dominance' ? 'RR × rr의 자손을 예측해 보세요. 둥근 모양이 나타나면 r은 어디에 남아 있을까요?' : mode === 'segregation' ? '부모를 RR / Rr / rr 중에서 바꿔 보세요. 부모가 바뀌면 이전 표본과 예측을 지웁니다.' : 'RrYy × RrYy를 탐구합니다. 씨 모양과 색깔의 유전자는 서로 다른 염색체에 있다는 가정입니다.';
  $('explain-question').textContent = mode === 'dominance' ? '자손 Rr에서 r은 사라졌나요? 부모가 준 대립유전자를 하나씩 짚어 설명해 보세요.' : mode === 'segregation' ? '각 생식세포에는 R과 r 중 무엇이 들어갔나요? 이번 표본의 비율과 이론적 확률은 왜 다를 수 있을까요?' : 'RY·Ry·rY·ry가 가능한 까닭을 설명해 보세요. 이번 표본이 9:3:3:1과 다르면 모형이 틀린 것일까요?';
  resetData('탐구 주제가 바뀌어 예측과 표본을 초기화했습니다.');
}
function token(label, allele, source) {
  const node = el('div', undefined, 'gene-card'); node.append(el('span', label, 'small'), el('strong', allele, 'alleles'), el('span', source, 'small')); return node;
}
function renderStage() {
  const t = theory(), [a, b] = parents(), diagram = $('diagram'); diagram.replaceChildren();
  $('step-title').textContent = `${step + 1}. ${titles[step]}`;
  document.querySelectorAll('.steps li').forEach((node, index) => { if (index === step) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current'); });
  if (step === 0) {
    diagram.append(token('부모 A', a, '대립유전자 쌍'), el('span', '×', 'join'), token('부모 B', b, '대립유전자 쌍'));
    $('step-note').textContent = '대문자와 소문자는 같은 유전자의 서로 다른 대립유전자입니다. 유전자마다 부모에게서 하나씩 받아 쌍을 이룹니다.';
  } else if (step === 1) {
    for (const [label, options] of [['부모 A가 줄 수 있는 생식세포', t.gametesA], ['부모 B가 줄 수 있는 생식세포', t.gametesB]]) {
      const group = el('div', undefined, 'gamete-group'); group.append(el('h4', label));
      const row = el('div', undefined, 'gametes'); for (const option of options) row.append(token(option.alleles, option.alleles, percent(option.probability))); group.append(row); diagram.append(group);
    }
    $('step-note').textContent = '여러 감수분열에서의 가능성과 확률입니다. 생식세포에는 유전자마다 대립유전자 하나씩만 들어갑니다. 한 번의 감수분열에서 모든 종류가 반드시 생기는 그림이 아닙니다.';
  } else {
    const example = observed.last || t.cells[0];
    if (step === 2) {
      diagram.append(token('부모 A의 생식세포', example.a, 'A에서 온 대립유전자'), el('span', '+', 'join'), token('부모 B의 생식세포', example.b, 'B에서 온 대립유전자'), el('span', '→', 'join'), token('수정 후', example.genotype, '다시 쌍을 이룸'));
    } else {
      diagram.append(token('자손 유전자형', example.genotype, 'A와 B의 대립유전자 조합'), el('span', '→', 'join'), token('자손 표현형', names[example.phenotype], '관찰되는 형질'));
    }
    $('step-note').textContent = `${observed.last ? '마지막 관찰 표본' : '가능한 조합 중 설명용 예시 (표본에 포함하지 않음)'}입니다. ${step === 2 ? '각 부모의 생식세포가 만나 자손의 대립유전자 쌍을 이룹니다.' : '완전 우성 모형에서 R이 있으면 둥근 씨입니다. 소문자 대립유전자가 사라진 것은 아닙니다.'}`;
  }
  $('next').disabled = step === 3; $('play').disabled = timer !== null || step === 3; $('pause').disabled = timer === null;
}
function resultTable(probabilities, counts, labelMap) {
  const table = el('table'), head = el('thead'), tr = el('tr');
  for (const heading of ['종류', '이론적 확률', '관찰 수', '관찰 빈도']) { const th = el('th', heading); th.scope = 'col'; tr.append(th); } head.append(tr); table.append(head);
  const body = el('tbody'); for (const [key, probability] of Object.entries(probabilities)) {
    const row = el('tr'), label = el('th', labelMap?.[key] || key); label.scope = 'row';
    row.append(label, el('td', percent(probability)), el('td', String(counts[key] || 0)), el('td', observed.count ? percent((counts[key] || 0) / observed.count) : '—')); body.append(row);
  } table.append(body); return table;
}
function slots(parent) { let results = ['']; for (const pair of parent.match(/.{2}/g)) results = results.flatMap((prefix) => [...pair].map((allele) => prefix + allele)); return results; }
function renderCross() {
  $('cross-wrap').hidden = !$('show-cross').checked;
  const [a, b] = parents(), rows = slots(a), columns = slots(b), table = el('table');
  table.append(el('caption', `${rows.length}×${columns.length} 교배표 · 각 칸 ${percent(1 / (rows.length * columns.length))}`));
  const head = el('thead'), first = el('tr'), corner = el('th', 'A ↓ / B →'); corner.scope = 'col'; first.append(corner);
  for (const value of columns) { const th = el('th', value); th.scope = 'col'; first.append(th); } head.append(first); table.append(head);
  const body = el('tbody'); for (const value of rows) {
    const row = el('tr'), th = el('th', value); th.scope = 'row'; row.append(th);
    for (const other of columns) row.append(el('td', [...value].map((letter, index) => [letter, other[index]].sort().join('')).join('')));
    body.append(row);
  } table.append(body); $('cross-table').replaceChildren(table);
}
function render() {
  renderStage(); const t = theory();
  $('genotype-results').replaceChildren(resultTable(t.genotypes, observed.genotypes));
  $('phenotype-results').replaceChildren(resultTable(t.phenotypes, observed.phenotypes, names));
  $('total').textContent = observed.count.toLocaleString('en-US');
  $('last').textContent = observed.last ? `마지막 관찰: 부모 A ${observed.last.a} + 부모 B ${observed.last.b} → ${observed.last.genotype} (${names[observed.last.phenotype]})` : '아직 관찰한 표본이 없습니다.';
  document.querySelectorAll('[data-count]').forEach((button) => { button.disabled = observed.count + Number(button.dataset.count) > MAX_SAMPLES; }); renderCross();
}
$('mode').addEventListener('change', setupMode);
for (const id of ['parent-a', 'parent-b']) $(id).addEventListener('change', () => resetData('부모가 바뀌어 재생을 멈추고 이전 표본과 예측을 지웠습니다.'));
$('next').addEventListener('click', () => { stop(); step = Math.min(3, step + 1); renderStage(); });
$('play').addEventListener('click', () => { if (timer !== null || step === 3) return; timer = setInterval(() => { step = Math.min(3, step + 1); if (step === 3) stop(); renderStage(); }, 1800); renderStage(); });
$('pause').addEventListener('click', () => { stop(); renderStage(); $('status').textContent = '과정 재생을 일시정지했습니다.'; });
$('reset').addEventListener('click', () => { $('mode').value = 'dominance'; setupMode(); $('status').textContent = '전체 초기화: 우열의 원리 RR × rr, 부모 단계, 표본 0개입니다.'; });
$('show-cross').addEventListener('change', renderCross);
document.querySelectorAll('[data-count]').forEach((button) => button.addEventListener('click', () => {
  const count = Number(button.dataset.count); if (observed.count + count > MAX_SAMPLES) { $('status').textContent = '표본 상한은 10,000개입니다.'; return; }
  const added = sample(...parents(), count); observed.count += count; observed.last = added.last;
  for (const kind of ['genotypes', 'phenotypes']) for (const [key, value] of Object.entries(added[kind])) observed[kind][key] = (observed[kind][key] || 0) + value;
  $('status').textContent = `${count}회 실험을 추가했습니다. 총 ${observed.count.toLocaleString('en-US')}개${observed.count === MAX_SAMPLES ? '. 최대 표본 수에 도달했습니다. 초기화하면 다시 시작할 수 있습니다.' : '.'}`; render();
}));
$('back').addEventListener('click', () => { window.location.href = new URL('../../', window.location.href).href; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); renderStage(); } });
window.addEventListener('pagehide', stop);
setupMode(); $('status').textContent = '예측한 뒤 다음 단계로 이동해 보세요.';
