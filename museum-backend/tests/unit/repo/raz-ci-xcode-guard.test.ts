import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKFLOWS = resolve(__dirname, '../../../../.github/workflows');

const jobsOf = (file: string): { name: string; body: string }[] => {
  const text = readFileSync(join(WORKFLOWS, file), 'utf8');
  const jobs = text.slice(text.indexOf('\njobs:\n'));
  return jobs
    .split(/\n(?= {2}[\w-]+:\n)/)
    .slice(1)
    .map((chunk) => ({ name: `${file} › ${chunk.trim().split(':')[0]}`, body: chunk }));
};

const iosBuildJobs = readdirSync(WORKFLOWS)
  .filter((file) => file.endsWith('.yml'))
  .flatMap(jobsOf)
  .filter((job) => /^\s+xcodebuild\b/m.test(job.body));

describe('RAZ-M16-CI-XCODE-26', () => {
  it('RAZ-M16-CI-XCODE-26 · la CI compile au moins un build iOS', () => {
    expect(iosBuildJobs.length).toBeGreaterThan(0);
  });

  it.each(iosBuildJobs.map((job) => [job.name, job.body]))(
    'RAZ-M16-CI-XCODE-26 · %s impose Xcode 26 avant xcodebuild',
    (_name, body) => {
      const guard = body.indexOf('require-xcode.sh');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(body.search(/^\s+xcodebuild\b/m));
    },
  );
});
