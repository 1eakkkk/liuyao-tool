import { replayFadeIn } from './helpers.js';

// Keep visible headings intact while giving every disclosure native keyboard
// activation and an expanded state that also follows programmatic resets.
export function bindDisclosure(heading, content, owner, id) {
  if (!heading || !content) return;
  content.id ||= id;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'disclosure-trigger';
  button.setAttribute('aria-controls', content.id);
  button.append(...heading.childNodes); heading.append(button);
  const sync = () => button.setAttribute('aria-expanded', String(owner.classList.contains('open')));
  sync();
  button.addEventListener('click', (event) => {
    owner.classList.toggle('open'); sync();
    if (owner.classList.contains('open') && event.detail > 0) replayFadeIn(content);
  });
  new MutationObserver(sync).observe(owner, { attributes: true, attributeFilter: ['class'] });
}
