// main.ts: Token Radar entrypoint for Node 22 (standard library only, erasable TypeScript).

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseSnapshot, buildBoardRows, boardIssue } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

function parseArgs(): { inputPath: string; outputPath: string } {
  const args = process.argv.slice(2);
  let inputPath = process.env.MAKEFUN_INPUT || '/input/snapshot.json';
  let outputPath = process.env.MAKEFUN_OUTPUT_DIR || '/output';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) {
      inputPath = args[i + 1]!;
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[i + 1]!;
      i++;
    }
  }

  // Fallback if default /input doesn't exist locally
  if (inputPath === '/input/snapshot.json' && !existsSync(inputPath)) {
    const localKitPath = '/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json';
    if (existsSync(localKitPath)) {
      inputPath = localKitPath;
    }
  }

  return { inputPath, outputPath };
}

function main(): void {
  const { inputPath, outputPath } = parseArgs();
  console.log(`[TokenRadar] Reading snapshot from: ${inputPath}`);

  let snapshotFile = inputPath;
  try {
    readFileSync(inputPath, 'utf8');
  } catch {
    if (existsSync(join(inputPath, 'snapshot.json'))) {
      snapshotFile = join(inputPath, 'snapshot.json');
    }
  }

  const rawJson = readFileSync(snapshotFile, 'utf8');
  const snapshot = parseSnapshot(rawJson);

  console.log(`[TokenRadar] Snapshot loaded successfully. As of: ${snapshot.as_of}, Total Protocols: ${snapshot.protocols.length}, Watchlist Count: ${snapshot.watchlist.length}`);

  const rows = buildBoardRows(snapshot);
  const board = { rows };

  // Validate board
  const err = boardIssue(board, snapshot);
  if (err) {
    console.error(`[TokenRadar] ERROR: Board validation failed: ${err}`);
    process.exit(1);
  }
  console.log(`[TokenRadar] Board successfully validated: ${rows.length} rows ranked (Rank 1: ${rows[0]?.name} [$${rows[0]?.implied_value_usd.toLocaleString()}], Rank 250: ${rows[249]?.name} [$${rows[249]?.implied_value_usd.toLocaleString()}])`);

  // Ensure output directories exist
  mkdirSync(outputPath, { recursive: true });
  const outDashboardDir = join(outputPath, 'dashboard');
  const outScreenshotsDir = join(outputPath, 'screenshots');
  mkdirSync(outDashboardDir, { recursive: true });
  mkdirSync(outScreenshotsDir, { recursive: true });

  // 1. Write board.json
  const boardJsonPath = join(outputPath, 'board.json');
  writeFileSync(boardJsonPath, JSON.stringify(board, null, 2), 'utf8');
  console.log(`[TokenRadar] Written: ${boardJsonPath}`);

  // 2. Write data.js
  const radarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: rows.length,
    rows: rows
  };
  const dataJsPath = join(outputPath, 'data.js');
  const dataJsContent = `window.RADAR = ${JSON.stringify(radarData, null, 2)};\n`;
  writeFileSync(dataJsPath, dataJsContent, 'utf8');
  console.log(`[TokenRadar] Written: ${dataJsPath}`);

  // 3. Copy dashboard files to output/dashboard/
  if (existsSync('dashboard')) {
    cpSync('dashboard', outDashboardDir, { recursive: true });
    console.log(`[TokenRadar] Copied dashboard/ to ${outDashboardDir}`);
  } else {
    console.warn(`[TokenRadar] WARNING: dashboard/ directory not found locally.`);
  }

  // 4. Copy screenshots to output/screenshots/
  if (existsSync('screenshots')) {
    cpSync('screenshots', outScreenshotsDir, { recursive: true });
    console.log(`[TokenRadar] Copied screenshots/ to ${outScreenshotsDir}`);
  } else {
    console.warn(`[TokenRadar] WARNING: screenshots/ directory not found locally.`);
  }

  // 5. Build and write dossier.json using vendor/makefun-board.ts
  try {
    const dossierBytes = buildDossier(outputPath, { text_max_bytes: 65536 });
    const dossierPath = join(outputPath, 'dossier.json');
    writeFileSync(dossierPath, dossierBytes);
    console.log(`[TokenRadar] Written dossier.json (${dossierBytes.length} bytes) to ${dossierPath}`);
  } catch (dErr) {
    console.error(`[TokenRadar] ERROR building dossier:`, dErr);
    process.exit(1);
  }

  console.log(`[TokenRadar] Build completed successfully. Output ready at: ${outputPath}`);
}

main();
