const key = 'liuyao_theme';
const system = window.matchMedia?.('(prefers-color-scheme: dark)') || {matches:false};
const choices = ['light', 'dark', 'system'];
let choice = document.documentElement.dataset.themeChoice || 'system';
function apply() {
  document.documentElement.dataset.theme = choice === 'system' ? (system.matches ? 'dark' : 'light') : choice;
  document.documentElement.dataset.themeChoice = choice;
  document.querySelectorAll('[data-theme-choice-button]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoiceButton === choice));
  });
}
document.querySelectorAll('[data-theme-choice-button]').forEach(button => {
  button.addEventListener('click', () => {
    choice = button.dataset.themeChoiceButton;
    try { localStorage.setItem(key, choice); } catch { /* Theme still works without storage. */ }
    apply();
  });
});
if (system.addEventListener) system.addEventListener('change', apply);
else system.addListener?.(apply);
window.addEventListener('storage', event => {
  if (event.key === key || event.key === null) {
    choice = choices.includes(event.newValue) ? event.newValue : 'system'; apply();
  }
});
apply();

const picker=document.querySelector('.theme-picker');
document.addEventListener('click',event=>{if(picker && !picker.contains(event.target))picker.open=false;});
picker?.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;picker.querySelector('summary').focus();}});
