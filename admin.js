import { supabase } from './supabase.js';
const app=document.querySelector('#admin-app');

function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c])); }

async function load(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){app.innerHTML='<div class="card"><h1>StatKick Admin</h1><p>Sign in with an authorized administrator account.</p></div>';return;}
  const {data:admin}=await supabase.from('admin_users').select('active,is_owner').eq('user_id',session.user.id).maybeSingle();
  if(!admin?.active){app.innerHTML='<div class="card"><h1>Admin access denied</h1><p>Your account is not an active StatKick administrator.</p></div>';return;}

  const [{count:users},{count:pools},{count:entries},{data:pay}]=await Promise.all([
    supabase.from('profiles').select('*',{count:'exact',head:true}),
    supabase.from('pools').select('*',{count:'exact',head:true}),
    supabase.from('pool_entries').select('*',{count:'exact',head:true}),
    supabase.from('payout_settings').select('bank_name,account_name,account_number').eq('id',true).maybeSingle()
  ]);

  app.innerHTML=`<div class="wrap">
    <div class="top"><div><h1>StatKick Admin</h1><p class="muted">Private operations dashboard</p></div><button id="out">Sign out</button></div>
    <div class="grid">
      <div class="card">Players<div class="value">${users||0}</div></div>
      <div class="card">Pools<div class="value">${pools||0}</div></div>
      <div class="card">Entries<div class="value">${entries||0}</div></div>
      <div class="card">Status<div class="value">Ready</div></div>
    </div>

    <section class="card section">
      <h2>Player payment account</h2>
      <p class="muted">Set the bank account players should use for manual deposits. This is separate from your personal login and is editable only by an active administrator.</p>
      <form id="pay-form" class="form">
        <label>Bank name<input id="bank" class="input" required maxlength="80" value="${esc(pay?.bank_name||'')}"></label>
        <label>Account name<input id="account-name" class="input" required maxlength="120" value="${esc(pay?.account_name||'')}"></label>
        <label>Account number<input id="account-number" class="input" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" required value="${esc(pay?.account_number||'')}"></label>
        <button type="submit">Save payment account</button>
      </form>
      <div id="pay-msg" class="message"></div>
      <p class="warning">Security: do not put your bank PIN, password, OTP, card number or online-banking credentials here. Only the receiving account details are needed.</p>
    </section>

    <section class="card section">
      <h2>Next transaction controls</h2>
      <p class="muted">Deposit requests can be recorded without increasing a player's balance. A balance must change only after an authorized admin/provider verification, with an audit trail and duplicate-payment protection.</p>
    </section>
  </div>`;

  document.querySelector('#out').onclick=()=>supabase.auth.signOut();
  document.querySelector('#pay-form').onsubmit=async (e)=>{
    e.preventDefault();
    const msg=document.querySelector('#pay-msg');
    const bank=document.querySelector('#bank').value.trim();
    const accountName=document.querySelector('#account-name').value.trim();
    const accountNumber=document.querySelector('#account-number').value.trim();
    if(!/^\d{10}$/.test(accountNumber)){msg.textContent='Enter a valid 10-digit Nigerian account number.';return;}
    msg.textContent='Saving…';
    const {error}=await supabase.from('payout_settings').upsert({id:true,bank_name:bank,account_name:accountName,account_number:accountNumber,updated_at:new Date().toISOString()},{onConflict:'id'});
    msg.textContent=error?`Could not save: ${error.message}`:'Payment account saved securely.';
  };
}

supabase.auth.onAuthStateChange(()=>load());
load();
