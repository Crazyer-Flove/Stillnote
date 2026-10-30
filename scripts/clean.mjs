import { rm } from 'node:fs/promises';
// Fixed project build outputs only; never remove user data.
await Promise.all(['dist', '.desktop-app'].map(path => rm(new URL(`../${path}`, import.meta.url), { recursive: true, force: true })));
