const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const operation = process.argv[2];
const rawArgs = process.argv.slice(3);

const parseName = () => {
  let value;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];

    if (token.startsWith('--name=')) {
      value = token.slice('--name='.length);
      break;
    }

    if (token === '--name') {
      value = rawArgs[index + 1];
      break;
    }

    if (!token.startsWith('-') && !value) {
      value = token;
    }
  }

  if (!value) {
    value = process.env.npm_config_name;
  }

  const trimmed = value ? value.trim() : '';
  return trimmed.length ? trimmed : undefined;
};

if (!operation || !['create', 'generate'].includes(operation)) {
  console.error('Usage: node ./scripts/migration-cli.cjs <create|generate> [name]');
  process.exit(1);
}

const name = parseName();
if (!name) {
  console.error(
    `Usage: npm run migration:${operation} -- --name=YourMigrationName`,
  );
  console.error(`   or: npm run migration:${operation} -- YourMigrationName`);
  process.exit(1);
}

const migrationsDir = 'src/data/db/migrations';
mkdirSync(resolve(process.cwd(), migrationsDir), { recursive: true });

const migrationPath = `${migrationsDir}/${name}`;
const typeormCommand = `migration:${operation}`;

const result = spawnSync(
  'npm',
  ['run', 'typeorm', '--', typeormCommand, migrationPath],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

process.exit(result.status ?? 1);
