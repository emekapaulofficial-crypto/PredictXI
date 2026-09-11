import { supabase } from './supabase.js';

const style = document.createElement('style');
style.textContent = `
.sk-modal-backdrop{position:fixed;inset:0;background:rgba(2,8,18,.82);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}
.sk-market-modal{width:min(520px,100%);background:#0b1728;border:1px solid rgba(0,232,135,.28);border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.5);padding:24px;color:#fff}
.sk-modal-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;margin-bottom:20px}.sk-modal-number{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#00e887;font-weight:800}.sk-modal-title{font-size:24px;font-weight:800;margin:5px 0}.sk-modal-line{font-size:14px;color:#93a4ba}.sk-close{width:38px;height:38px;border-radius:12px;border:1px solid #26364b;background:#111f32;color:#fff;font-size:20px;cursor:pointer}.sk-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sk-choice{border:1px solid #2a4058;background:#101f31;border-radius:15px;padding:18px 12px;color:#fff;cursor:pointer;font-weight:800;font-size:15px;transition:.18s}.sk-choice:hover,.sk-choice:focus{border-color:#00e887;transform:translateY(-1px)}.sk-choice.over{background:rgba(0,232,135,.09)}.sk-choice.under{background:rgba(255,193,7,.07)}
.sk-all-markets{grid-column:1/-1;margin:4px 0 8px;color:#8ea1b9;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
`;
document.head.appendChild(style);

function escapeHtml(value){return String(value ?? '').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
function closeMarketModal(){document.querySelector('.sk-modal-backdrop')?.remove();}

async function ensureAll20Markets(){
  const grid=document.querySelector('.market-grid');
  if(!grid || grid.dataset.skAll20==='1') return;
  const {data:markets,error}=await supabase.from('markets').select('*').eq('active',true).order('market_number');
  if(error || !markets?.length) return;
  grid.innerHTML='';
  const icons=['⚽','▥','◎','▣','◈','◉','↗','◒','◓','◔'];
  markets.slice(0,20).forEach((m,i)=>{
    const tile=document.createElement('button');
    tile.className='market-tile'; tile.dataset.market=m.id;
    tile.innerHTML=`<div class="market-icon">${icons[i%icons.length]}</div><div class="market-name">${escapeHtml(m.market_number)}. ${escapeHtml(m.name)}</div><div class="market-line">${m.selection_type==='yes_no'?'Yes / No':`Line ${escapeHtml(m.line)}`}</div>`;
    grid.appendChild(tile);
  });
  grid.dataset.skAll20='1';
  wireMarketTiles();
}

async function openMarket(marketId){
  const {data: market,error}=await supabase.from('markets').select('*').eq('id',marketId).maybeSingle();
  if(error || !market) return;
  const isYesNo=market.selection_type==='yes_no';
  const line=market.line==null?null:Number(market.line);
  const lineText=isYesNo?'Yes / No':`Line ${line.toFixed(2)}`;
  const choices=isYesNo
    ? `<button class="sk-choice over" data-sk-choice="YES">YES</button><button class="sk-choice under" data-sk-choice="NO">NO</button>`
    : `<button class="sk-choice over" data-sk-choice="OVER">OVER ${line.toFixed(2)}</button><button class="sk-choice under" data-sk-choice="UNDER">UNDER ${line.toFixed(2)}</button>`;
  const backdrop=document.createElement('div');
  backdrop.className='sk-modal-backdrop';
  backdrop.innerHTML=`<div class="sk-market-modal" role="dialog" aria-modal="true"><div class="sk-modal-head"><div><div class="sk-modal-number">Market ${escapeHtml(market.market_number)}</div><div class="sk-modal-title">${escapeHtml(market.name)}</div><div class="sk-modal-line">${lineText}</div></div><button class="sk-close" aria-label="Close">×</button></div><div class="sk-choice-grid">${choices}</div></div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.sk-close').addEventListener('click',closeMarketModal);
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeMarketModal()});
  backdrop.querySelectorAll('[data-sk-choice]').forEach(btn=>btn.addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('statkick:market-choice',{detail:{marketId,choice:btn.dataset.skChoice}}));closeMarketModal();}));
}

function wireMarketTiles(){
  document.querySelectorAll('.market-tile[data-market]').forEach(tile=>{
    if(tile.dataset.skWired==='1') return;
    tile.dataset.skWired='1';
    tile.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openMarket(tile.dataset.market);},true);
  });
}

const observer=new MutationObserver(()=>{wireMarketTiles();ensureAll20Markets();});
observer.observe(document.body,{childList:true,subtree:true});
wireMarketTiles();
ensureAll20Markets();
