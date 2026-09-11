import { supabase } from './supabase.js';
const app=document.querySelector('#admin-app');
const PDFJS=window.pdfjsLib;
if(PDFJS) PDFJS.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js';
function esc(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
function money(v){return `₦${Number(v||0).toLocaleString('en-NG',{maximumFractionDigits:2})`;}
async function session(){return (await supabase.auth.getSession()).data.session;}
function loginView(message=''){
 app.innerHTML=`<div class="wrap"><section class="card login-card"><h1>StatKick Admin</h1><p class="muted">Private administration portal</p><form id="login-form" class="form"><label>Email<input id="login-email" class="input" type="email" autocomplete="username" required></label><label>Password<input id="login-password" class="input" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form><div class="message">${esc(message)}</div></section></div>`;
 document.querySelector('#login-form').onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('.message');msg.textContent='Signing in…';const {error}=await supabase.auth.signInWithPassword({email:document.querySelector('#login-email').value.trim(),password:document.querySelector('#login-password').value});if(error)msg.textContent=error.message;else await load();};
}
const competitions=['Premier League','La Liga','Serie A','Bundesliga','Ligue 1','Champions League','Europa League','CAF'];
const monthMap={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function parseDateValue(s){
 let m=s.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);if(m)return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
 m=s.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})\b/);if(m)return new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));
 m=s.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);if(m)return new Date(Date.UTC(+m[3],monthMap[m[2].slice(0,3).toLowerCase()],+m[1]));
 m=s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i);if(m)return new Date(Date.UTC(+m[3],monthMap[m[1].slice(0,3).toLowerCase()],+m[2]));
 return null;
}
function parsePdfLine(line){
 const clean=line.replace(/[|•·]+/g,' ').replace(/\s+/g,' ').trim();
 if(!clean)return null;
 const comp=competitions.find(c=>new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(clean));
 const d=parseDateValue(clean); if(!d)return null;
 const tm=clean.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:-|–)?\s*(?:GMT|WAT|UTC)?\b/i);
 let kickoff=new Date(d.getTime()); if(tm){kickoff.setUTCHours(+tm[1],+tm[2],0,0);}
 const vs=clean.match(/(.+?)\s+(?:vs\.?|v\.?|versus)\s+(.+?)(?=\s+(?:\d{1,2}[:.]\d{2}|\d{1,2}[-\/]\d{1,2}[-\/]20\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))|$)/i);
 if(!vs)return null;
 let home=vs[1].replace(comp||'','').replace(/\b(20\d{2})[-\/]\d{1,2}[-\/]\d{1,2}\b|\b\d{1,2}[-\/]\d{1,2}[-\/]20\d{2}\b/gi,'').trim().replace(/^[-–,:]+|[-–,:]+$/g,'');
 let away=vs[2].replace(/\b(20\d{2})[-\/]\d{1,2}[-\/]\d{1,2}\b|\b\d{1,2}[-\/]\d{1,2}[-\/]20\d{2}\b/gi,'').trim().replace(/^[-–,:]+|[-–,:]+$/g,'');
 if(!home||!away||home.length>100||away.length>100)return null;
 return {competition:comp||'Premier League',home_team:home,away_team:away,kickoff_at:kickoff.toISOString()};
}
async function extractPdfMatches(file){
 if(!PDFJS)throw new Error('PDF reader is unavailable. Refresh the Admin page and try again.');
 const data=new Uint8Array(await file.arrayBuffer());
 const pdf=await PDFJS.getDocument({data}).promise; let text='';
 for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const tc=await page.getTextContent();text+=tc.items.map(x=>x.str).join(' ')+'\n';}
 const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean); const matches=[]; const seen=new Set();
 for(const line of lines){const m=parsePdfLine(line);if(!m)continue;const key=`${m.competition}|${m.home_team}|${m.away_team}|${m.kickoff_at}`.toLowerCase();if(!seen.has(key)){seen.add(key);matches.push(m);}}
 return {matches,text};
}
async function importPdfBatch(file,msg,preview){
 msg.textContent='Reading PDF and detecting matches…';preview.innerHTML='';
 try{const result=await extractPdfMatches(file);const dates=[...new Set(result.matches.map(x=>x.kickoff_at.slice(0,10)))].sort();
  if(!result.matches.length){preview.innerHTML='<p class="muted">No match rows were detected. The PDF should contain rows such as: Premier League | Arsenal vs Chelsea | 12 Sep 2026 | 15:00.</p>';msg.textContent='No matches detected.';return;}
  if(dates.length>3){msg.textContent='This PDF contains more than 3 match dates. Please upload a three-day PDF.';return;}
  const previewRows=result.matches.map((m,i)=>`<div class="pool-row"><div><b>${i+1}. ${esc(m.home_team)} vs ${esc(m.away_team)}</b><div class="muted">${esc(m.competition)} · ${new Date(m.kickoff_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})}</div></div></div>`).join('');
  preview.innerHTML=`<div class="message">Detected ${result.matches.length} matches across ${dates.length} day(s).</div><div class="pool-list">${previewRows}</div><button id="confirm-pdf-import" type="button">Import these matches</button>`;
  msg.textContent='Review the detected matches, then import them.';
  document.querySelector('#confirm-pdf-import').onclick=async()=>{const btn=document.querySelector('#confirm-pdf-import');btn.disabled=true;btn.textContent='Importing…';msg.textContent='Creating fixtures and pools…';const {data,error}=await supabase.rpc('admin_import_fixture_batch',{p_matches:result.matches});if(error){msg.textContent=`Import failed: ${error.message}`;btn.disabled=false;btn.textContent='Import these matches';return;}msg.textContent=`Import complete: ${data?.created||0} created, ${data?.skipped||0} already existed, ${data?.invalid||0} rejected.`;preview.innerHTML='';document.querySelector('#pdf-match-form').reset();await load();};
 }catch(err){msg.textContent=`Could not read PDF: ${err.message}`;}
}
async function load(){
 const s=await session();
 if(!s){loginView();return;}
 let {data:admin}=await supabase.from('admin_users').select('active,is_owner').eq('user_id',s.user.id).maybeSingle();
 if(!admin){const {data:boot,error}=await supabase.rpc('bootstrap_statkick_owner');if(!error&&boot){admin={active:true,is_owner:true};}}
 if(!admin?.active){app.innerHTML='<div class="wrap"><section class="card"><h1>Admin access denied</h1><p class="muted">This account is not an active StatKick administrator.</p><button id="back-login">Back to sign in</button></section></div>';document.querySelector('#back-login').onclick=()=>supabase.auth.signOut();return;}
 const [{count:users},{count:pools},{count:entries},{data:pay},{data:poolRows},{data:admins}]=await Promise.all([
  supabase.from('profiles').select('*',{count:'exact',head:true}),supabase.from('pools').select('*',{count:'exact',head:true}),supabase.from('pool_entries').select('*',{count:'exact',head:true}),supabase.from('payout_settings').select('bank_name,account_name,account_number').eq('id',true).maybeSingle(),supabase.from('pools').select('id,entry_fee,status,max_entries,locked_at,created_at,fixtures(home_team,away_team,kickoff_at,competitions(name))').order('created_at',{ascending:false}).limit(50),supabase.rpc('list_statkick_admins')
 ]);
 const ids=(poolRows||[]).map(p=>p.id);let lineCounts={};
 if(ids.length){const {data:lines}=await supabase.from('pool_market_lines').select('pool_id,locked_at').in('pool_id',ids);(lines||[]).forEach(x=>{lineCounts[x.pool_id]=(lineCounts[x.pool_id]||{count:0,locked:0});lineCounts[x.pool_id].count++;if(x.locked_at)lineCounts[x.pool_id].locked++;});}
 const poolHtml=(poolRows||[]).map(p=>{const f=p.fixtures||{};const lc=lineCounts[p.id]||{count:0,locked:0};const canLock=p.status==='open'&&!p.locked_at;return `<div class="pool-row"><div><b>${esc(f.home_team||'Home')} vs ${esc(f.away_team||'Away')}</b><div class="muted">${esc(f.competitions?.name||'Football')} · ${f.kickoff_at?new Date(f.kickoff_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'}):'No kickoff'}</div></div><div>${money(p.entry_fee)} · ${esc(p.status)}<div class="muted">Lines: ${lc.count}/20 ${lc.locked===20?'· LOCKED':''}</div></div><div>${canLock?`<button class="admin-action lock-pool" data-pool="${p.id}">Generate & Lock Lines</button>`:`<span class="muted">${p.locked_at?'Lines locked':'Not lockable'}</span>`}</div></div>`;}).join('')||'<p class="muted">No pools created yet.</p>';
 const adminRows=(admins||[]).map(a=>`<div class="pool-row"><div><b>${esc(a.email||a.user_id)}</b><div class="muted">${a.is_owner?'Owner':'Administrator'} · ${a.active?'Active':'Inactive'}</div></div><div>${a.is_owner?'Protected owner account':'Administrative access'}</div><div>${a.is_owner?'':'<button class="admin-action remove-admin" data-id="'+esc(a.user_id)+'">Remove access</button>'}</div></div>`).join('')||'<p class="muted">No administrators configured.</p>';
 app.innerHTML=`<div class="wrap"><div class="top"><div><h1>StatKick Admin</h1><p class="muted">Private operations dashboard · Owner protected</p></div><button id="out">Sign out</button></div>
 <div class="grid"><div class="card">Players<div class="value">${users||0}</div></div><div class="card">Pools<div class="value">${pools||0}</div></div><div class="card">Entries<div class="value">${entries||0}</div></div><div class="card">Status<div class="value">Ready</div></div></div>
 <section class="card section"><h2>Three-day match PDF upload</h2><p class="muted">Upload one PDF containing up to three days of upcoming matches. Review what was detected, then import. After those three days finish, upload the next three-day PDF. Existing fixtures are skipped automatically.</p><form id="pdf-match-form" class="form"><label>Three-day match PDF<input id="match-pdf" class="input" type="file" accept="application/pdf,.pdf" required></label><button type="submit">Read PDF</button></form><div id="pdf-msg" class="message"></div><div id="pdf-preview" class="pool-list"></div></section>
 <section class="card section"><h2>Single match upload</h2><p class="muted">For an individual missing fixture, you can still add one manually.</p><form id="fixture-form" class="form"><label>Competition<select id="fixture-competition" class="input" required>${competitions.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></label><label>Home team<input id="home-team" class="input" required maxlength="100" placeholder="Home team"></label><label>Away team<input id="away-team" class="input" required maxlength="100" placeholder="Away team"></label><label>Kickoff date and time<input id="kickoff" class="input" type="datetime-local" required></label><button type="submit">Upload single match</button></form><div id="fixture-msg" class="message"></div></section>
 <section class="card section"><h2>Administrators</h2><p class="muted">Only the owner can add or remove administrators. The owner account is permanently protected from removal or deactivation.</p><form id="admin-form" class="form"><label>Add registered user by email<input id="admin-email" class="input" type="email" required placeholder="user@example.com"></label><button type="submit">Add administrator</button></form><div id="admin-msg" class="message"></div><div class="pool-list">${adminRows}</div></section>
 <section class="card section"><h2>Pool & market controls</h2><p class="muted">Generate the 20 pool-specific lines before locking a pool. Once entries start, the server will not allow line changes.</p><div class="pool-list">${poolHtml}</div><div id="pool-msg" class="message"></div></section>
 <section class="card section"><h2>Player payment account</h2><p class="muted">Set the bank account players should use for manual deposits. This is editable only by an active administrator.</p><form id="pay-form" class="form"><label>Bank name<input id="bank" class="input" required maxlength="80" value="${esc(pay?.bank_name||'')}"></label><label>Account name<input id="account-name" class="input" required maxlength="120" value="${esc(pay?.account_name||'')}"></label><label>Account number<input id="account-number" class="input" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" required value="${esc(pay?.account_number||'')}"></label><button type="submit">Save payment account</button></form><div id="pay-msg" class="message"></div></section>
 <section class="card section"><h2>Transaction controls</h2><p class="muted">Deposit requests are recorded without automatically increasing player balances. Authorized balance changes require verification and an audit trail.</p></section></div>`;
 document.querySelector('#out').onclick=()=>supabase.auth.signOut();
 document.querySelector('#pdf-match-form').onsubmit=async e=>{e.preventDefault();const file=document.querySelector('#match-pdf').files[0];if(!file){return;}if(file.size>20*1024*1024){document.querySelector('#pdf-msg').textContent='PDF is too large. Maximum size is 20 MB.';return;}await importPdfBatch(file,document.querySelector('#pdf-msg'),document.querySelector('#pdf-preview'));};
 document.querySelector('#fixture-form').onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('#fixture-msg');const home=document.querySelector('#home-team').value.trim();const away=document.querySelector('#away-team').value.trim();const kickoff=document.querySelector('#kickoff').value;if(!home||!away||!kickoff){msg.textContent='Complete all match fields.';return;}msg.textContent='Uploading match…';const localDate=new Date(kickoff);if(Number.isNaN(localDate.getTime())||localDate<=new Date()){msg.textContent='Kickoff must be in the future.';return;}const {data,error}=await supabase.rpc('admin_create_fixture_and_pool',{p_competition:document.querySelector('#fixture-competition').value,p_home_team:home,p_away_team:away,p_kickoff_at:localDate.toISOString(),p_external_id:null});if(error){msg.textContent=`Could not upload match: ${error.message}`;return;}msg.textContent=`Match uploaded successfully. Pool created and 20 market lines prepared.`;e.target.reset();await load();};
 if(admin.is_owner){document.querySelector('#admin-form').onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('#admin-msg');msg.textContent='Adding administrator…';const {error}=await supabase.rpc('add_statkick_admin_by_email',{p_email:document.querySelector('#admin-email').value.trim()});msg.textContent=error?`Could not add administrator: ${error.message}`:'Administrator added successfully.';if(!error)await load();};document.querySelectorAll('.remove-admin').forEach(btn=>btn.onclick=async()=>{if(!confirm('Remove this administrator’s access?'))return;btn.disabled=true;const {error}=await supabase.rpc('remove_statkick_admin',{p_user_id:btn.dataset.id});if(error){alert(error.message);btn.disabled=false;}else await load();});}else{document.querySelector('#admin-form').style.display='none';}
 document.querySelectorAll('.lock-pool').forEach(btn=>btn.onclick=async()=>{if(!confirm('Generate and permanently lock the market lines for this pool?'))return;btn.disabled=true;btn.textContent='Locking…';const {data,error}=await supabase.rpc('lock_pool',{p_pool_id:btn.dataset.pool});const msg=document.querySelector('#pool-msg');if(error){msg.textContent=`Could not lock pool: ${error.message}`;btn.disabled=false;btn.textContent='Generate & Lock Lines';return;}msg.textContent=`Pool locked. ${data?.lines||20} market lines are now fixed.`;await load();});
 document.querySelector('#pay-form').onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('#pay-msg');const bank=document.querySelector('#bank').value.trim();const accountName=document.querySelector('#account-name').value.trim();const accountNumber=document.querySelector('#account-number').value.trim();if(!/^\d{10}$/.test(accountNumber)){msg.textContent='Enter a valid 10-digit Nigerian account number.';return;}msg.textContent='Saving…';const {error}=await supabase.from('payout_settings').upsert({id:true,bank_name:bank,account_name:accountName,account_number:accountNumber,updated_at:new Date().toISOString()},{onConflict:'id'});msg.textContent=error?`Could not save: ${error.message}`:'Payment account saved securely.';};
}
supabase.auth.onAuthStateChange(()=>load());
load();
