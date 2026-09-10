import { supabase } from './supabase.js';
const app=document.querySelector('#admin-app');
async function load(){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session){app.innerHTML='<div class="card"><h1>StatKick Admin</h1><p>Sign in with an authorized administrator account.</p></div>';return;}
 const {data:admin}=await supabase.from('admin_users').select('active,is_owner').eq('user_id',session.user.id).maybeSingle();
 if(!admin?.active){app.innerHTML='<div class="card"><h1>Admin access denied</h1><p>Your account is not an active StatKick administrator.</p></div>';return;}
 const [{count:users},{count:pools},{count:entries}]=await Promise.all([
  supabase.from('profiles').select('*',{count:'exact',head:true}),
  supabase.from('pools').select('*',{count:'exact',head:true}),
  supabase.from('pool_entries').select('*',{count:'exact',head:true})
 ]);
 app.innerHTML='<div class="wrap"><h1>StatKick Admin</h1><p class="muted">Operations dashboard</p><div class="grid"><div class="card">Players<div class="value">'+(users||0)+'</div></div><div class="card">Pools<div class="value">'+(pools||0)+'</div></div><div class="card">Entries<div class="value">'+(entries||0)+'</div></div><div class="card">Status<div class="value">Live</div></div></div><div class="card" style="margin-top:20px"><h2>Admin controls</h2><p>Fixture management, pool management, verified statistics and settlement controls are being connected to the secure backend.</p><button id="out">Sign out</button></div></div>';
 document.querySelector('#out').onclick=()=>supabase.auth.signOut();
}
supabase.auth.onAuthStateChange(()=>load());
load();
