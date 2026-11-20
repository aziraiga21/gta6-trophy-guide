import catalog from './data/trophies.json' with { type: 'json' };
import meta from './data/meta.json' with { type: 'json' };

const { trophies } = catalog;
const byId = new Map(trophies.map(trophy => [trophy.id, trophy]));
const grades = ['platinum', 'gold', 'silver', 'bronze'];
const kinds = {
  all: 'All', story: 'Story', missable: 'Missable', collectibles: 'Collectibles',
  activities: 'Activities', crime: 'Crime', 'side-strand': 'Side strands',
  misc: 'Misc', secret: 'Secret', unconfirmed: 'Unconfirmed'
};
const confidenceLabels = { confirmed: 'Confirmed', 'single-source': 'Single-source', unconfirmed: 'Unconfirmed' };
const storageKey = 'vice-meridian-v1';
const $ = id => document.getElementById(id);
const number = value => value.toLocaleString('en-US');
const cleanState = () => ({version: 1, earned: [], counts: {}, spoiler: true});
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

function validate(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.earned) ||
      typeof data.spoiler !== 'boolean' || !data.counts ||
      Array.isArray(data.counts) || typeof data.counts !== 'object') {
    throw new Error('Expected a Vice Meridian backup.');
  }
  if (data.earned.some(id => !byId.has(id))) throw new Error('A trophy ID is invalid.');
  const counts = {};
  for (const [id, value] of Object.entries(data.counts)) {
    const trophy = byId.get(Number(id));
    if (!trophy?.count || String(trophy.id) !== id || !Number.isInteger(value) || value < 0 || value > trophy.count) {
      throw new Error('A trophy count is outside its allowed range.');
    }
    counts[id] = value;
  }
  return {version: 1, earned: [...new Set(data.earned)], counts, spoiler: data.spoiler};
}

let state = cleanState();
let kind = 'all';
let activeId = 0;
let forceSpoiler = false;
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) state = validate(JSON.parse(stored));
} catch {
  $('message').textContent = 'Saved progress could not be read.';
}

function save(message = '') {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    $('message').textContent = message;
  } catch {
    $('message').textContent = 'Browser storage is unavailable. Export to keep your progress.';
  }
}

const earned = trophy => state.earned.includes(trophy.id);
const concealed = trophy => (forceSpoiler || state.spoiler) && trophy.kind.includes('story') && !earned(trophy);
const visibleName = trophy => concealed(trophy) ? 'Story trophy — hidden until earned' : trophy.name;
const sourceLink = (source, label = source.name) => source.url
  ? `<a class="source-link" href="${escape(source.url)}" title="${escape(source.name)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`
  : escape(label);

function references(refs) {
  return '<span class="refs">' + refs.map(key => sourceLink(meta.sources[key], key)).join('') + '</span>';
}

const claim = entry => escape(entry.text) + references(entry.refs);
const paragraphs = claims => claims.map(entry => '<p>' + claim(entry) + '</p>').join('');
const bullets = claims => claims.map(entry => '<li>' + claim(entry) + '</li>').join('');
const tag = (label, css = '') => `<span class="tag ${css}">${escape(label)}</span>`;
const trophyTags = trophy => [
  tag(trophy.grade),
  ...trophy.kind.map(value => tag(kinds[value], value === 'missable' ? 'risk' : '')),
  tag(confidenceLabels[trophy.confidence], trophy.confidence === 'unconfirmed' ? 'uncertain' : trophy.confidence)
].join('');

function renderProgress() {
  const total = trophies.length;
  const percentage = Math.round(state.earned.length / total * 100);
  const rows = grades.map(grade => {
    const group = trophies.filter(trophy => trophy.grade === grade);
    const done = group.filter(earned).length;
    return `<div class="grade-line ${grade}"><span><i class="dot"></i>${grade}</span><span>${done}/${group.length} · ${Math.round(done / group.length * 100)}%</span></div>`;
  }).join('');
  $('progress').innerHTML = `<div class="ring" style="--fill:${percentage}%" aria-label="${percentage}% earned"><div><strong>${state.earned.length}/${total}</strong><small>${percentage}% earned</small></div></div><div>${rows}</div>`;
  $('spoiler').textContent = 'Spoilers hidden · ' + (forceSpoiler || state.spoiler ? 'ON' : 'OFF');
  $('spoiler').setAttribute('aria-pressed', String(forceSpoiler || state.spoiler));
}

function renderList() {
  const query = $('search').value.trim().toLowerCase();
  const grade = $('grade').value.toLowerCase();
  const status = $('status').value;
  const sort = $('sort').value;
  const filtered = trophies.filter(trophy => {
    const searchable = [visibleName(trophy), concealed(trophy) ? '' : trophy.description].join(' ').toLowerCase();
    return searchable.includes(query) && (!grade || trophy.grade === grade) &&
      (!status || earned(trophy) === (status === 'earned')) &&
      (kind === 'all' || trophy.kind.includes(kind) || trophy.confidence === kind);
  });
  filtered.sort((a,b) => {
    if (sort === 'name') return visibleName(a).localeCompare(visibleName(b)) || a.id - b.id;
    if (sort === 'grade') return grades.indexOf(a.grade) - grades.indexOf(b.grade) || a.id - b.id;
    return a.stage - b.stage || b.kind.includes('missable') - a.kind.includes('missable') || Number(concealed(a)) - Number(concealed(b)) || a.id - b.id;
  });
  $('matches').textContent = filtered.length + ' / ' + trophies.length + ' trophies';
  $('list').innerHTML = filtered.map(trophy => {
    const name = escape(visibleName(trophy));
    const description = concealed(trophy) ? '' : `<p>${escape(trophy.description)}</p>`;
    const count = trophy.count ? tag(number(state.counts[trophy.id] ?? 0) + '/' + number(trophy.count)) : '';
    return `<article class="record ${activeId === trophy.id ? 'selected' : ''}">
      <a class="open-record" href="#/trophy/${trophy.id}${forceSpoiler ? '?spoiler=on' : ''}">
        <span class="medal ${trophy.grade}" aria-hidden="true">${trophy.grade[0].toUpperCase()}</span>
        <div class="record-copy"><h3>${name}</h3>${description}<div class="tags">${trophyTags(trophy)}${count}</div></div>
      </a><label class="earn"><input type="checkbox" data-earned="${trophy.id}" aria-label="Earned: ${name}" ${earned(trophy) ? 'checked' : ''}>Earned</label>
    </article>`;
  }).join('') || '<p class="paper">No trophies match these filters.</p>';
}

function renderDetail() {
  const trophy = byId.get(activeId);
  if (!trophy) {
    const stats = [[meta.totals.hours + ' h', 'Platinum estimate'], [meta.totals.difficulty, 'Difficulty'], [meta.totals.playthroughs, 'Playthrough'], [meta.totals.online, 'Online trophies']];
    $('detail').innerHTML = `<div class="sheet"><p class="kicker">PLATINUM ROUTE · ESTIMATES ${references(['P','K'])}</p>
      <h2>Before you leave Chapter 1</h2>
      <div class="warning"><strong>One potentially missable trophy</strong><br> Take Lucia’s balcony meditation at Jason’s house. ${references(['P','K'])}</div>
      <div class="mini-stats">${stats.map(([value,label]) => `<div><b>${value}</b><span>${label}</span></div>`).join('')}</div>
      <div class="aside-links"><a href="#/trophy/28">Open the meditation guide <span>→</span></a><a href="#/roadmap">Plan your platinum route <span>→</span></a><a href="#/sources">Inspect the guide’s evidence <span>→</span></a></div></div>`;
    return;
  }
  const locked = concealed(trophy);
  const count = trophy.count && !locked ? `<label class="count-control">Your tally
    <input id="count" type="number" required min="0" max="${trophy.count}" step="1" value="${state.counts[trophy.id] ?? 0}">
    / ${number(trophy.count)}${[52,53].includes(trophy.id) ? ' USD' : ''}</label>` : '';
  $('detail').innerHTML = `<div class="sheet guide-open">
    <p class="kicker">TROPHY GUIDE · STAGE ${trophy.stage} ${trophy.hidden ? '· PS5 HIDDEN' : ''}</p>
    <h2>${escape(visibleName(trophy))}</h2>
    <div class="tags">${trophyTags(trophy)}</div>
    ${locked ? '<p>Use the spoiler setting to reveal this guide, or mark the trophy earned once it unlocks.</p>' : `
    <p class="official">${escape(trophy.description)}</p>
    ${trophy.missable ? `<div class="warning">${claim(trophy.missable)}</div>` : ''}
    ${trophy.confidence === 'unconfirmed' ? '<p><strong>Unconfirmed — no published method yet (21 Nov 2026 research snapshot)</strong></p>' : ''}
    ${paragraphs(trophy.claims)}
    <div class="citation-row"><strong>Sources</strong> ${trophy.sources.map(source => sourceLink(source)).join(' · ')}</div>
    ${trophy.steps.length ? `<h3>Steps</h3><ol>${bullets(trophy.steps)}</ol>` : ''}
    ${count}`}
    </div>`;
}

function renderRoadmap() {
  const { checklist, stages, totals } = meta;
  $('page').innerHTML = `<div class="page-heading"><div><p class="kicker">PLATINUM ROUTE</p><h2 class="page-title">The roadmap</h2></div>
    <p>~${totals.hours} hours · ${totals.difficulty} difficulty · ${totals.playthroughs} playthrough ${references(['P','K'])}</p></div>
    <div class="road-stages">${stages.map((stage,index) => `<article class="paper"><span class="case-label">STAGE ${index+1} / ${stage.hours}</span>
    <h3>${escape(stage.title)}</h3>${paragraphs(stage.claims)}</article>`).join('')}</div>
    <div class="road-grid"><section class="paper"><h3>One potentially missable trophy</h3><div class="warning">${claim(meta.missable)}</div>
    <p><a class="source-link" href="#/trophy/28">Open Positive Mental Attitude →</a></p>
    <details open><summary>Watch out</summary><ul>${bullets(meta.watch)}</ul></details></section>
    <section class="paper"><h3>What the 100% checklist counts</h3><p>${claim(checklist.intro)}</p>
    <div class="check-columns"><div><h4>Selected partial targets</h4><ul>${bullets(checklist.partial)}</ul></div>
    <div><h4>Required in full</h4><ul>${bullets(checklist.full)}</ul></div></div>
    <details><summary>Other checklist categories</summary>${paragraphs(checklist.other)}</details></section></div>`;
}

function renderAudit() {
  const entries = trophies.flatMap(trophy => [...trophy.claims, ...trophy.steps, ...(trophy.missable ? [trophy.missable] : [])]);
  const open = trophies.filter(trophy => trophy.confidence === 'unconfirmed');
  const stats = [
    [trophies.filter(trophy => trophy.sources.length).length + '/' + trophies.length, 'Guides with sources'],
    [entries.filter(entry => entry.refs.length).length, 'Cited guide statements'],
    [entries.reduce((sum, entry) => sum + entry.refs.length, 0), 'Inline citations'],
    [entries.filter(entry => new Set(entry.refs).size >= 2).length, 'Statements citing 2+ sources'],
    [open.length, 'Open unlock methods']
  ];
  $('page').innerHTML = `<div class="page-heading"><div><p class="kicker">RESEARCH RECORD</p><h2 class="page-title">Sources &amp; audit</h2></div><p>Research snapshot · 21 November 2026</p></div>
    <div class="audit-stats">${stats.map(([count,label]) => `<div><b>${count}</b><span>${label}</span></div>`).join('')}</div>
    <div class="audit-grid"><section class="paper"><h3>Source register</h3>
    <p>Official PlayStation names, descriptions and grades via Exophase and PSNProfiles.</p>
    <table><thead><tr><th>Source</th><th>Coverage</th><th>Access</th></tr></thead><tbody>
    ${Object.entries(meta.sources).map(([key,source]) => `<tr><td>${escape(key)} · ${sourceLink(source)}</td><td>${escape(source.backs)}</td><td>${source.accessed ?? 'Unavailable'}</td></tr>`).join('')}
    </tbody></table></section>
    <section class="paper"><h3>What is still unconfirmed</h3>
    <p>These trophies are open in the research snapshot. Follow the linked guides for updates.</p>
    <ul class="open-cases">${open.map(trophy => `<li><a href="#/trophy/${trophy.id}">${escape(trophy.name)}</a></li>`).join('')}</ul>
    <p><strong>${trophies.filter(t => t.confidence === 'confirmed').length}</strong> confirmed unlock guides · <strong>${trophies.filter(t => t.confidence === 'single-source').length}</strong> single-source guides</p>
    <p>Inline totals cover guide sentences, steps and missable notes. Confirmation applies to the unlock condition. A single-source guide has one walkthrough supporting its trigger.</p></section></div>`;
}

function renderRoute() {
  const [path, query] = (location.hash.slice(1) || '/').split('?');
  forceSpoiler = new URLSearchParams(query).get('spoiler') === 'on' || new URLSearchParams(location.search).get('spoiler') === 'on';
  const match = path.match(/^\/trophy\/(\d+)$/);
  activeId = match && byId.has(Number(match[1])) ? Number(match[1]) : 0;
  const view = path === '/roadmap' ? 'roadmap' : path === '/sources' ? 'sources' : 'checklist';
  document.querySelectorAll('nav a').forEach(link => {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('hero').classList.toggle('compact', Boolean(activeId));
  $('hero').hidden = $('checklist').hidden = view !== 'checklist';
  $('page').hidden = view === 'checklist';
  renderProgress();
  if (view === 'roadmap') renderRoadmap();
  else if (view === 'sources') renderAudit();
  else {
    renderList();
    renderDetail();
    if (activeId) {
      const selected = $('list').querySelector('.selected');
      if (selected) $('list').scrollTop += Math.max(0, selected.getBoundingClientRect().bottom - $('list').getBoundingClientRect().bottom);
    }
  }
  window.scrollTo(0, 0);
}

$('kinds').innerHTML = Object.entries(kinds).map(([value,label]) => `<button type="button" data-kind="${value}" aria-pressed="${value === kind}">${label}</button>`).join('');
$('kinds').addEventListener('click', event => {
  if (!event.target.dataset.kind) return;
  kind = event.target.dataset.kind;
  $('kinds').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kind === kind)));
  $('list').scrollTop = 0;
  renderList();
});
for (const id of ['search','grade','status','sort']) {
  $(id).addEventListener('input', () => {
    $('list').scrollTop = 0;
    renderList();
  });
}

$('list').addEventListener('change', event => {
  if (!event.target.dataset.earned) return;
  const id = Number(event.target.dataset.earned);
  state.earned = event.target.checked ? [...new Set([...state.earned, id])] : state.earned.filter(value => value !== id);
  save();
  renderProgress();
  renderList();
  renderDetail();
  $('list').querySelector('[data-earned="' + id + '"]')?.focus({preventScroll:true});
});
$('detail').addEventListener('change', event => {
  const input = event.target;
  if (input.id !== 'count') return;
  if (!input.checkValidity()) {
    input.reportValidity();
    input.value = state.counts[activeId] ?? 0;
    return;
  }
  state.counts[activeId] = input.valueAsNumber;
  save();
  renderList();
});

$('spoiler').addEventListener('click', () => {
  state.spoiler = !(forceSpoiler || state.spoiler);
  save();
  if (forceSpoiler) {
    const url = new URL(location.href);
    url.searchParams.delete('spoiler');
    url.hash = url.hash.split('?')[0];
    history.replaceState(null, '', url);
  }
  renderRoute();
});
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vice-meridian-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('message').textContent = 'Backup downloaded.';
});
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 65536) throw new Error('Backup exceeds 64 KiB.');
    const replacement = validate(JSON.parse(await file.text()));
    state = replacement;
    save('Backup imported.');
    renderRoute();
  } catch (error) {
    $('message').textContent = 'Import failed. ' + (error instanceof SyntaxError ? 'The file is invalid JSON.' : error.message);
  }
  event.target.value = '';
});
$('reset').addEventListener('click', () => {
  if (!window.confirm('Clear all saved earned trophies and tallies?')) return;
  state = cleanState();
  save('Progress reset.');
  renderRoute();
});

window.addEventListener('hashchange', renderRoute);
renderRoute();
