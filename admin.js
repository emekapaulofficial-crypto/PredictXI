import { supabase } from './supabase.js';
const app=document.querySelector('#admin-app');
function esc(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
function money(v){return `₦${Number(v||0).toLocaleString('en-NG',{maximumFractionDigits:2})}`;}

async function load(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){app.innerHTML='<div class="card"><h1>StatKick Admin</h1><p>Sign in with an authorized administrator account.</p></div>';return;}
  const {data:admin}=await supabase.from('admin_users').select('active,is_owner').eq('user_id',session.user.id).maybeSingle();
  if(!admin?.active){app.innerHTML='<div class="card"><h1>Admin access denied</h1><p>Your account is not an active StatKick administrator.</p></div>';return;}

  const [{count:users},{count:pools},{count:entries},{data:pay},{data:poolRows}]=await Promise.all([
    supabase.from('profiles').select('*',{count:'exact',head:true}),
    supabase.from('pools').select('*',{count:'exact',head:true}),
    supabase.from('pool_entries').select('*',{count:'exact',head:true}),
    supabase.from('payout_settings').select('bank_name,account_name,account_number').eq('id',true).maybeSingle(),
    supabase.from('pools').select('id,entry_fee,status,max_entries,locked_at,created_at,fixtures(home_team,away_team,kickoff_at,competitions(name))').order('created_at',{ascending:false}).limit(50)
  ]);

  const ids=(poolRows||[]).map(p=>p.id);
  let lineCounts={};
  if(ids.length){const {data:lines}=await supabase.from('pool_market_lines').select('pool_id,locked_at').in('pool_id',ids);(lines||[]).forEach(x=>{lineCounts[x.pool_id]=(lineCounts[x.pool_id]||{count:0,locked:0});lineCounts[x.pool_id].count++;if(x.locked_at)lineCounts[x.pool_id].locked++;});}

  const poolHtml=(poolRows||[]).map(p=>{
    const f=p.fixtures||{}; const lc=lineCounts[p.id]||{count:0,locked:0};
    const canLock=p.status==='open'&&!p.locked_at;
    return `<div class="pool-row"><div><b>${esc(f.home_team||'Home')} vs ${esc(f.away_team||'Away')}</b><div class="muted">${esc(f.competitions?.name||'Football')} · ${f.kickoff_at?new Date(f.kickoff_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'}):'No kickoff'}</div></div><div>${money(p.entry_fee)} · ${esc(p.status)}<div class="muted">Lines: ${lc.count}/20 ${lc.locked===20?'· LOCKED':''}</div></div><div>${canLock?`<button class="admin-action lock-pool" data-pool="${p.id}">Generate & Lock Lines</button>`:`<span class="muted">${p.locked_at?'Lines locked':'Not lockable'}</span>`}</div></div>`;
  }).join('')||'<p class="muted">No pools created yet.</p>';

  app.innerHTML=`<div class="wrap">
    <div class="top"><div><h1>StatKick Admin</h1><p class="muted">Private operations dashboard</p></div><button id="out">Sign out</button></div>
    <div class="grid"><div class="card">Players<div class="value">${users||0}</div></div><div class="card">Pools<div class="value">${pools||0}</div></div><div class="card">Entries<div class="value">${entries||0}</div></div><div class="card">Status<div class="value">Ready</div></div></div>

    <section class="card section"><h2>Pool & market controls</h2><p class="muted">Generate the 20 pool-specific lines before locking a pool. Once entries start, the server will not allow line changes. Locked lines are stored with every prediction.</p><div class="pool-list">${poolHtml}</div><div id="pool-msg" class="message"></div></section>

    <section class="card section"><h2>Player payment account</h2><p class="muted">Set the bank account players should use for manual deposits. This is separate from your personal login and editable only by an active administrator.</p><form id="pay-form" class="form"><label>Bank name<input id="bank" class="input" required maxlength="80" value="${esc(pay?.bank_name||'')}"></label><label>Account name<input id="account-name" class="input" required maxlength="120" value="${esc(pay?.account_name||'')}"></label><label>Account number<input id="account-number" class="input" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" required value="${esc(pay?.account_number||'')}"></label><button type="submit">Save payment account</button></form><div id="pay-msg" class="message"></div><p class="warning">Do not put a bank PIN, password, OTP, card number or online-banking credentials here.</p></section>

    <section class="card section"><h2>Transaction controls</h2><p class="muted">Deposit requests are recorded without automatically increasing a player's balance. Balance changes should happen only after authorized verification, with an audit trail and duplicate-payment protection.</p></section>
  </div>`;

  document.querySelector('#out').onclick=()=>supabase.auth.signOut();
  document.querySelectorAll('.lock-pool').forEach(btn=>btn.onclick=async()=>{
    if(!confirm('Generate and permanently lock the market lines for this pool? This cannot be reversed after entries start.'))return;
    btn.disabled=true;btn.textContent='Locking…';
    const {data,error}=await supabase.rpc('lock_pool',{p_pool_id:btn.dataset.pool});
    const msg=document.querySelector('#pool-msg');
    if(error){msg.textContent=`Could not lock pool: ${error.message}`;btn.disabled=false;btn.textContent='Generate & Lock Lines';return;}
    msg.textContent=`Pool locked. ${data?.lines||20} market lines are now fixed.`;await load();
  });
  document.querySelector('#pay-form').onsubmit=async(e)=>{e.preventDefault();const msg=document.querySelector('#pay-msg');const bank=document.querySelector('#bank').value.trim();const accountName=document.querySelector('#account-name').value.trim();const accountNumber=document.querySelector('#account-number').value.trim();if(!/^\d{10}$/.test(accountNumber)){msg.textContent='Enter a valid 10-digit Nigerian account number.';return;}msg.textContent='Saving…';const {error}=await supabase.from('payout_settings').upsert({id:true,bank_name:bank,account_name:accountName,account_number:accountNumber,updated_at:new Date().toISOString()},{onConflict:'id'});msg.textContent=error?`Could not save: ${error.message}`:'Payment account saved securely.';};
}
supabase.auth.onAuthStateChange(()=>load());
load();
