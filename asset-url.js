// Shared root for source modules and the flat, split production bundles.
// Keeping this relative to the module also supports publication in a subfolder.
export const assetURL = path => new URL(`./assets/${path}`, import.meta.url).href;
