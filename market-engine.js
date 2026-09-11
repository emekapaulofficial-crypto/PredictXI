import { supabase } from './supabase.js';

/*
 * StatKick market interaction layer.
 *
 * Rules:
 * - 20 markets are available.
 * - A player may select exactly 10 markets for a ₦2,000 entry.
 * - O/U markets always expose Over and Under around the locked line.
 * - Yes/No markets expose Yes and No.
 * - The line shown here comes from the database. It is not changed after a pool opens.
 * - Once historical verified statistics are available, the server-side line engine can
 *   replace/update the pool line before opening; this browser layer never manipulates it.
 */

const style = document.createElement('style');
style.textContent = `
.sk-modal-backdrop{position:fixed;inset:0;background:rgba(2,8,18,.82);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}
.sk-market-modal{width:min(520px,100%);background:#0b1728;border:1px solid rgba(0,232,135,.28);border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.5);padding:24px;color:#fff}
.sk-modal-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;margin-bottom:20px}
.sk-modal-number{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#00e887;font-weight:800}
.sk-modal-title{font-size:24px;font-weight:800;margin:5px 0}
.sk-modal-line{font-size:14px;color:#93a4ba}
.sk-close{width:38px;height:38px;border-radius:12px;border:1px solid #26364b;background:#111f32;color:#fff;font-size:20px;cursor:pointer}
.sk-engine-box{background:#0f2035;border:1px solid #203b55;border-radius:16px;padding:16px;margin-bottom:18px}
.sk-engine-box strong{display:block;margin-bottom:6px}.sk-engine-box span{color:#9bb0c8;font-size:13px;line-height:1.5}
.sk-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sk-choice{border:1px solid #2a4058;background:#101f31;border-radius:15px;padding:17px 12px;color:#fff;cursor:pointer;font-weight:800;font-size:15px;transition:.18s}
.sk-choice:hover,.sk-choice:focus{border-color:#00e887;transform:translateY(-1px)}
.sk-choice.over{background:rgba(0,232,135,.09)}.sk-choice.under{background:rgba(255,193,7,.07)}
.sk-choice small{display:block;color:#8ea1b9;font-size:11px;margin-top:5px;font-weight:500}
.sk-modal-note{font-size:12px;color:#778ba4;margin:16px 0 0;line-height:1.5}
`;
document.head.appendChild(style);

function escapeHtml(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function closeMarketModal(){document.querySelector('.sk-modal-backdrop')?.remove();}

async function openMarket(marketId){
  const {data: market, error} = await supabase.from('markets').select('*').eq('id',marketId).maybeSingle();
  if(error || !market) return;

  const isYesNo = market.selection_type === 'yes_no';
  const line = market.line == null ? null : Number(market.line);
  const lineText = isYesNo ? 'Yes / No' : `Line ${line.toFixed(2)}`;
  const choices = isYesNo
    ? `<button class="sk-choice over" data-sk-choice="YES">YES<small>Both/condition is true</small></button>
       <button class="sk-choice under" data-sk-choice="NO">NO<small>Both/condition is false</small></button>`
    : `<button class="sk-choice over" data-sk-choice="OVER ${line.toFixed(2)}">OVER ${line.toFixed(2)}<small>Stat finishes above the line</small></button>
       <button class="sk-choice under" data-sk-choice="UNDER ${line.toFixed(2)}">UNDER ${line.toFixed(2)}<small>Stat finishes below the line</small></button>`;

  const backdrop=document.createElement('div');
  backdrop.className='sk-modal-backdrop';
  backdrop.innerHTML=`<div class="sk-market-modal" role="dialog" aria-modal="true">
    <div class="sk-modal-head">
      <div><div class="sk-modal-number">Market ${escapeHtml(market.market_number)}</div>
      <div class="sk-modal-title">${escapeHtml(market.name)}</div>
      <div class="sk-modal-line">${lineText}</div></div>
      <button class="sk-close" aria-label="Close">×</button>
    </div>
    <div class="sk-engine-box"><strong>⚙ Competitive prediction engine</strong><span>This pool uses the published line. It is fixed when the pool opens and is not moved after players begin entering.</span></div>
    <div class="sk-choice-grid">${choices}</div>
    <p class="sk-modal-note">Choose one side for this market. You still need exactly 10 different markets before an entry can be submitted.</p>
  </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelector('.sk-close').addEventListener('click',closeMarketModal);
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeMarketModal()});
  backdrop.querySelectorAll('[data-sk-choice]').forEach(btn=>btn.addEventListener('click',()=>{
    const choice=btn.dataset.skChoice;
    closeMarketModal();
    // Keep the choice visible in a lightweight confirmation. The authoritative
    // selection remains the pool entry selector, which writes through the secure RPC.
    const event=new CustomEvent('statkick:market-choice',{detail:{marketId,choice}});
    window.dispatchEvent(event);
    document.querySelector('.pools')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

function wireMarketTiles(){
  document.querySelectorAll('.market-tile[data-market]').forEach(tile=>{
    if(tile.dataset.skWired==='1') return;
    tile.dataset.skWired='1';
    tile.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      openMarket(tile.dataset.market);
    },true);
  });
}

const observer=new MutationObserver(wireMarketTiles);
observer.observe(document.body,{childList:true,subtree:true});
wireMarketTiles();
window.addEventListener('statkick:market-choice',e=>{
  const text=e.detail?.choice;
  if(text) console.info('StatKick market choice:',text);
});
