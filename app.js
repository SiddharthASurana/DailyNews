/* ============================================================
   THE DAILY WIRE — AUDIO EDITION PLAYER
   Flow:
   1. Fetch news/manifest.json -> show a list of available editions.
   2. User picks one -> fetch news/<file>.json -> show the reader.
   3. "<- Editions" button in the masthead returns to the picker.
   This file should not need to change day-to-day — only
   news/manifest.json (one line) and a new news/newsDDMMYY.json
   file are added for each new edition.
   ============================================================ */

let articles = [];
let currentArticle = 0;
let currentChunk = 0;
let isPlaying = false;
const synth = window.speechSynthesis;
let voices = [];

const editionPicker = document.getElementById('editionPicker');
const editionList = document.getElementById('editionList');
const mainEl = document.getElementById('main');
const dockEl = document.getElementById('dock');
const backBtn = document.getElementById('backBtn');
const progressCount = document.getElementById('progressCount');
const progressTitle = document.getElementById('progressTitle');
const needle = document.getElementById('needle');
const onair = document.getElementById('onair');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const voiceSelect = document.getElementById('voiceSelect');
const speedSlider = document.getElementById('speedSlider');
const speedVal = document.getElementById('speedVal');
const sectionStrip = document.getElementById('sectionStrip');
const dateLine = document.getElementById('dateLine');

/* ============================================================
   EDITION PICKER
   ============================================================ */
async function loadManifest(){
  try{
    const res = await fetch('news/manifest.json', {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const editions = data.editions || [];
    if(!editions.length) throw new Error('manifest.json has no editions listed');
    renderEditionList(editions);
  } catch(err){
    editionList.innerHTML = `
      <div class="error-msg">
        <h3>Couldn't load news/manifest.json</h3>
        <p>${err.message}</p>
        <p>If you opened <code>index.html</code> directly by double-clicking it, most browsers block a local page from fetching another local file for security reasons.</p>
        <p>Fix: serve this folder with a simple local web server instead, e.g. from a terminal in this folder run:</p>
        <p><code>python3 -m http.server 8000</code></p>
        <p>...then open <code>http://localhost:8000</code> in your browser.</p>
      </div>
    `;
  }
}

function renderEditionList(editions){
  // Newest first
  const sorted = [...editions].sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  editionList.innerHTML = sorted.map(ed => `
    <button class="edition-card" data-file="${ed.file}" data-label="${ed.label || ed.date || ed.file}">
      <span class="ed-label">${ed.label || ed.date || ed.file}</span>
      <span class="ed-count">${ed.count ? ed.count + ' stories' : ''}</span>
      <span class="ed-arrow">&#8594;</span>
    </button>
  `).join('');

  editionList.querySelectorAll('.edition-card').forEach(card => {
    card.addEventListener('click', () => {
      openEdition(card.dataset.file, card.dataset.label);
    });
  });
}

async function openEdition(file, label){
  try{
    const res = await fetch('news/' + file, {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    articles = data.articles || [];
    if(!articles.length) throw new Error(file + ' has no articles');

    dateLine.textContent = label || (data.date && data.date.trim()) || file;

    // Switch from picker to reader view
    editionPicker.classList.add('hidden');
    mainEl.classList.remove('hidden');
    dockEl.classList.remove('hidden');
    backBtn.classList.remove('hidden');

    // Reset player state for the new edition
    synth.cancel();
    currentArticle = 0;
    currentChunk = 0;
    setPlayUI(false);

    buildSectionStrip();
    renderArticle(0);
    highlightChunk();
  } catch(err){
    mainEl.classList.remove('hidden');
    dockEl.classList.add('hidden');
    editionPicker.classList.add('hidden');
    backBtn.classList.remove('hidden');
    mainEl.innerHTML = `
      <div class="error-msg">
        <h3>Couldn't load news/${file}</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

backBtn.addEventListener('click', () => {
  synth.cancel();
  setPlayUI(false);
  mainEl.classList.add('hidden');
  dockEl.classList.add('hidden');
  backBtn.classList.add('hidden');
  editionPicker.classList.remove('hidden');
  dateLine.textContent = 'Audio Edition';
});

/* ============================================================
   CHUNKING
   ============================================================ */
function getChunks(article){
  const chunks = [];
  chunks.push({type:'lead', text:`${article.headline}. ${article.original}`});
  (article.terms || []).forEach(t => chunks.push({type:'term', text:`${t.t}: ${t.d}`}));
  chunks.push({type:'simple', text:`In simple words: ${article.simple}`});
  chunks.push({type:'background', text: article.background});
  chunks.push({type:'relevance', text: article.relevance});
  return chunks;
}

/* ============================================================
   RENDERING
   ============================================================ */
function buildSectionStrip(){
  const sections = [...new Set(articles.map(a=>a.section))];
  sectionStrip.innerHTML = sections.map(s=>`<span data-sec="${s}">${s}</span>`).join('');
}

function updateSectionStrip(){
  const current = articles[currentArticle].section;
  [...sectionStrip.children].forEach(el=>{
    el.classList.toggle('current', el.dataset.sec === current);
  });
}

function renderArticle(i){
  const a = articles[i];
  const terms = a.terms || [];
  const termsHtml = terms.length
    ? terms.map((t,idx)=>`<div class="term-item" data-chunk="${idx+1}"><span class="term">${t.t}:</span> <span class="def">${t.d}</span></div>`).join('')
    : '<div class="no-terms">No specialised terms in this one.</div>';
  const simpleIdx = 1 + terms.length;
  const backgroundIdx = simpleIdx + 1;
  const relevanceIdx = backgroundIdx + 1;

  mainEl.innerHTML = `
    <div class="eyebrow"><span class="dot"></span>${a.section} · Story ${i+1} of ${articles.length}</div>
    <h2 class="headline">${a.headline}</h2>
    <div class="card" data-chunk="0">
      <h3>From today's paper</h3>
      <p class="original-snip">${a.original}</p>
    </div>
    <div class="card">
      <h3>Key terms explained</h3>
      <div class="terms-list">${termsHtml}</div>
    </div>
    <div class="card" data-chunk="${simpleIdx}">
      <h3>In simple words</h3>
      <p>${a.simple}</p>
    </div>
    <div class="card">
      <h3>Background &amp; why it matters</h3>
      <p data-chunk="${backgroundIdx}">${a.background}</p>
      <p data-chunk="${relevanceIdx}">${a.relevance}</p>
    </div>
  `;
  const angle = articles.length > 1 ? (i / (articles.length-1)) * 180 - 90 : -90;
  needle.style.transform = `translate(-50%,-100%) rotate(${angle}deg)`;
  updateSectionStrip();
  window.scrollTo({top:0, behavior:'smooth'});
}

function highlightChunk(){
  document.querySelectorAll('[data-chunk]').forEach(el=>el.classList.remove('active-chunk'));
  const el = document.querySelector(`[data-chunk="${currentChunk}"]`);
  if(el){
    el.classList.add('active-chunk');
    el.scrollIntoView({behavior:'smooth', block:'center'});
  }
  const a = articles[currentArticle];
  const chunks = getChunks(a);
  progressTitle.textContent = a.headline;
  progressCount.textContent = `${currentArticle+1} / ${articles.length} · part ${currentChunk+1}/${chunks.length}`;
}

/* ============================================================
   SPEECH
   ============================================================ */
function speakChunk(){
  synth.cancel();
  highlightChunk();
  const a = articles[currentArticle];
  const chunks = getChunks(a);
  const chunk = chunks[currentChunk];
  const utter = new SpeechSynthesisUtterance(chunk.text);
  const selectedVoice = voices.find(v=>v.name === voiceSelect.value);
  if(selectedVoice) utter.voice = selectedVoice;
  utter.rate = parseFloat(speedSlider.value);
  utter.onend = () => {
    if(isPlaying) advanceAndSpeak();
  };
  synth.speak(utter);
}

function advanceAndSpeak(){
  const chunks = getChunks(articles[currentArticle]);
  if(currentChunk < chunks.length - 1){
    currentChunk++;
    speakChunk();
  } else if(currentArticle < articles.length - 1){
    currentArticle++;
    currentChunk = 0;
    renderArticle(currentArticle);
    speakChunk();
  } else {
    isPlaying = false;
    setPlayUI(false);
  }
}

function setPlayUI(playing){
  isPlaying = playing;
  playIcon.style.display = playing ? 'none' : '';
  pauseIcon.style.display = playing ? '' : 'none';
  onair.classList.toggle('live', playing);
}

/* ============================================================
   CONTROLS
   ============================================================ */
document.getElementById('playBtn').addEventListener('click', ()=>{
  if(!articles.length) return;
  if(!isPlaying){
    setPlayUI(true);
    if(synth.paused && synth.speaking){
      synth.resume();
    } else {
      speakChunk();
    }
  } else {
    synth.pause();
    setPlayUI(false);
  }
});

document.getElementById('nextBtn').addEventListener('click', ()=>{
  if(!articles.length) return;
  synth.cancel();
  const chunks = getChunks(articles[currentArticle]);
  if(currentChunk < chunks.length - 1){
    currentChunk++;
  } else if(currentArticle < articles.length - 1){
    currentArticle++;
    currentChunk = 0;
    renderArticle(currentArticle);
  } else {
    return;
  }
  if(isPlaying) speakChunk(); else highlightChunk();
});

document.getElementById('prevBtn').addEventListener('click', ()=>{
  if(!articles.length) return;
  synth.cancel();
  if(currentChunk > 0){
    currentChunk--;
  } else if(currentArticle > 0){
    currentArticle--;
    renderArticle(currentArticle);
    currentChunk = getChunks(articles[currentArticle]).length - 1;
  } else {
    return;
  }
  if(isPlaying) speakChunk(); else highlightChunk();
});

speedSlider.addEventListener('input', ()=>{
  speedVal.textContent = parseFloat(speedSlider.value).toFixed(1) + 'x';
  if(isPlaying) speakChunk();
});

voiceSelect.addEventListener('change', ()=>{
  if(isPlaying) speakChunk();
});

/* ============================================================
   VOICES
   ============================================================ */
function populateVoices(){
  voices = synth.getVoices();
  if(!voices.length) return;
  const englishVoices = voices.filter(v=>v.lang.toLowerCase().startsWith('en'));
  const list = englishVoices.length ? englishVoices : voices;
  voiceSelect.innerHTML = list.map(v=>`<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');
}
populateVoices();
if(speechSynthesis.onvoiceschanged !== undefined){
  speechSynthesis.onvoiceschanged = populateVoices;
}

/* ============================================================
   BOOT
   ============================================================ */
loadManifest();
