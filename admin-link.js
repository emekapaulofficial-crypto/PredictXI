function addAdminLink(){
  if(document.querySelector('#statkick-admin-link')) return;
  const link=document.createElement('a');
  link.id='statkick-admin-link';
  link.href='/admin.html';
  link.textContent='Admin Login';
  link.setAttribute('aria-label','Open StatKick administrator login');
  Object.assign(link.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'9999',padding:'10px 14px',borderRadius:'10px',background:'#111827',color:'#fff',font:'600 13px Inter,Arial,sans-serif',textDecoration:'none',boxShadow:'0 6px 18px rgba(0,0,0,.2)'});
  document.body.appendChild(link);
}
addAdminLink();
new MutationObserver(addAdminLink).observe(document.body,{childList:true,subtree:true});
