export function bindChatComposer({ input, send, form, onSubmit, onError = () => {}, onDraftChange = () => {}, isEnabled = () => true }) {
  let pending = false, composing = false, compositionEndedAt = -Infinity;
  const onInput = () => onDraftChange(input.value);
  const startComposition = () => { composing = true; compositionEndedAt = -Infinity; };
  const endComposition = () => { composing = false; compositionEndedAt = performance.now(); };
  const keyUp = event => { if (event.key === 'Enter') compositionEndedAt = -Infinity; };

  async function submit(event) {
    event?.preventDefault();
    if (pending || composing || !isEnabled() || !input.value.trim()) return false;
    const content = input.value, disabled = send.disabled, readOnly = input.readOnly, label = send.textContent;
    pending = true; send.disabled = true; input.readOnly = true;
    send.textContent = '正在发送…'; input.setAttribute('aria-busy', 'true');
    try {
      await onSubmit({ content });
      if (input.value === content) { input.value = ''; onInput(); }
      return true;
    } catch (error) {
      onError(error);
      return false;
    } finally {
      pending = false; send.disabled = disabled; input.readOnly = readOnly; send.textContent = label;
      input.removeAttribute('aria-busy');
    }
  }
  const keyDown = event => {
    if (event.key !== 'Enter') { compositionEndedAt = -Infinity; return; }
    if (event.isComposing || composing || event.keyCode === 229) return;
    // Some IMEs report the confirmation Enter after compositionend.
    if (performance.now() - compositionEndedAt < 80) { event.preventDefault(); return; }
    event.preventDefault();
    if (event.repeat || pending || !isEnabled()) return;
    if (event.ctrlKey) {
      input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      void submit();
    }
  };
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', keyDown);
  input.addEventListener('keyup', keyUp);
  input.addEventListener('compositionstart', startComposition);
  input.addEventListener('compositionend', endComposition);
  send.addEventListener('click', submit);
  form?.addEventListener('submit', submit);
  return {
    submit,
    get pending() { return pending; },
    dispose() {
      input.removeEventListener('input', onInput); input.removeEventListener('keydown', keyDown); input.removeEventListener('keyup', keyUp);
      input.removeEventListener('compositionstart', startComposition); input.removeEventListener('compositionend', endComposition);
      send.removeEventListener('click', submit); form?.removeEventListener('submit', submit);
    }
  };
}
