import {browserRpc,dispose} from './host.js';
window.browserRpc=message=>browserRpc(message,phase=>document.querySelector('#status').textContent=phase);
window.disposeFormal=dispose;
