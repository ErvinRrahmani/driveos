import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

configure({ asyncUtilTimeout: 10_000 });

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
