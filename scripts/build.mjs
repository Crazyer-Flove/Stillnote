import { build as viteBuild } from 'vite';
import { build as serverBuild } from 'esbuild';
await viteBuild();
await serverBuild({entryPoints:['server.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',sourcemap:true,outfile:'dist/server.cjs',define:{'process.env.NODE_ENV':'"production"'}});
