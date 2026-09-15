/** Bootstrap: one Host, one renderer, one mount point. */

import { Host } from './host.ts';
import { render } from './render.ts';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');

const host = new Host();
host.subscribe((snapshot, reason) => render(root, snapshot, host, reason));

// Expose for debugging in the browser console (e.g. host.exportLog()).
(window as unknown as { host: Host }).host = host;
