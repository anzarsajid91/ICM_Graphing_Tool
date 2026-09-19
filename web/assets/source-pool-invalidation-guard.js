(() => {
  'use strict';
  const NativeMutationObserver = MutationObserver;
  const sourceSignature = () => [...state.files.values()]
    .map(item => [item.id || '', item.status || '', item.file?.name || item.displayName || ''].join('|'))
    .sort()
    .join('\n');

  window.MutationObserver = class SourceAwareMutationObserver extends NativeMutationObserver {
    constructor(callback) {
      super((records, observer) => {
        if (observer.__icmSourcePoolGuard) {
          const next = sourceSignature();
          if (next === observer.__icmSourcePoolSignature) return;
          observer.__icmSourcePoolSignature = next;
        }
        callback(records, observer);
      });
    }
    observe(target, options) {
      if (target && target.id === 'poolBody') {
        this.__icmSourcePoolGuard = true;
        this.__icmSourcePoolSignature = sourceSignature();
      }
      return super.observe(target, options);
    }
  };
})();
