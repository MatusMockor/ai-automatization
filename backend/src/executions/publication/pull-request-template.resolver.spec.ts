import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { PullRequestTemplateResolver } from './pull-request-template.resolver';

const TEST_DIR = `/tmp/ai-automation-pr-template-${process.pid}`;

describe('PullRequestTemplateResolver', () => {
  const resolver = new PullRequestTemplateResolver();

  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('prefers .github/pull_request_template.md', async () => {
    await mkdir(join(TEST_DIR, '.github'), { recursive: true });
    await writeFile(
      join(TEST_DIR, '.github', 'pull_request_template.md'),
      'primary template',
      'utf8',
    );
    await writeFile(
      join(TEST_DIR, 'pull_request_template.md'),
      'root template',
      'utf8',
    );

    const content = await resolver.resolve(TEST_DIR);

    expect(content).toBe('primary template');
  });

  it('falls back to first markdown file in .github/PULL_REQUEST_TEMPLATE directory', async () => {
    await mkdir(join(TEST_DIR, '.github', 'PULL_REQUEST_TEMPLATE'), {
      recursive: true,
    });
    await writeFile(
      join(TEST_DIR, '.github', 'PULL_REQUEST_TEMPLATE', 'b-template.md'),
      'b-template',
      'utf8',
    );
    await writeFile(
      join(TEST_DIR, '.github', 'PULL_REQUEST_TEMPLATE', 'a-template.md'),
      'a-template',
      'utf8',
    );

    const content = await resolver.resolve(TEST_DIR);

    expect(content).toBe('a-template');
  });
});
