type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'success';
}

function removeNode(node: HTMLElement | null): void {
  if (node?.parentNode) node.parentNode.removeChild(node);
}

export function showToast(message: string, kind: ToastKind = 'success'): void {
  const toast = document.createElement('div');
  toast.className = `cloudnote-toast is-${kind}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => removeNode(toast), 180);
  }, 2200);
}

export function confirmAction({
  title = '确认操作',
  message = '',
  confirmText = '确认',
  cancelText = '取消',
  variant = 'primary',
}: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <div class="confirm-dialog-backdrop" data-confirm-cancel></div>
      <section class="confirm-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
        <h2 id="confirmDialogTitle">${title}</h2>
        <p>${message}</p>
        <div class="confirm-dialog-actions">
          <button class="secondary-button compact-button" type="button" data-confirm-cancel>${cancelText}</button>
          <button class="compact-button ${variant === 'danger' ? 'danger-button' : variant === 'success' ? 'success-button' : ''}" type="button" data-confirm-ok>${confirmText}</button>
        </div>
      </section>
    `;

    const close = (value: boolean) => {
      removeNode(dialog);
      document.removeEventListener('keydown', onKeydown);
      resolve(value);
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false);
    };

    dialog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-confirm-ok]')) close(true);
      if (target?.closest('[data-confirm-cancel]')) close(false);
    });

    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(dialog);
    dialog.querySelector<HTMLElement>('[data-confirm-ok]')?.focus();
  });
}
