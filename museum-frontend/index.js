// Entry point forwarder — used by expo-updates build script.
// Workaround for SDK 55 where Metro 404s on `node_modules/expo-router/entry` (extension stripped).
// Keeping the real entry here gives Metro a project-local relative path with `.js` that always resolves.
import 'expo-router/entry';
