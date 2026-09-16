'use strict';

const { spawn, spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

async function main() {
  console.log('[demo] prisma migrate deploy');
  run('./node_modules/.bin/prisma', ['migrate', 'deploy']);

  const prisma = new PrismaClient();
  try {
    const count = await prisma.tradeCase.count();
    const force = process.env.DEMO_FORCE_SEED === '1';
    if (force || count === 0) {
      console.log(
        force
          ? '[demo] DEMO_FORCE_SEED=1，重新写入种子数据'
          : '[demo] 空库，写入 DEMO-PASS / DEMO-SOFT / DEMO-BLOCK / DEMO-GATE',
      );
      await prisma.$disconnect();
      run('node', ['dist-seed/prisma/seed.js']);
    } else {
      console.log(`[demo] 已有 ${count} 条案件，跳过 seed（持久化卷保留数据）`);
      await prisma.$disconnect();
    }
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    throw err;
  }

  const child = spawn(process.execPath, ['dist/main.js'], {
    stdio: 'inherit',
    env: process.env,
  });
  const shutdown = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code == null ? 1 : code);
  });
}

main().catch((err) => {
  console.error('[demo] 启动失败', err);
  process.exit(1);
});
