/**
 * Host half of the workspace HUD bundle.
 *
 * The pinned card is rendered entirely by the Client bundle (`client.js`), which
 * reads its data through existing Remote services. This half exists so the Loader
 * has one mounted row whose package declares `dsh.client`; without a mounted row
 * the Client module never enters the browser boot graph.
 */
export function apply() {}
