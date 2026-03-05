import { ConfigService } from '@nestjs/config';
import { ManagedRepository } from '../../repositories/entities/repository.entity';
import { SettingsService } from '../../settings/settings.service';
import { PreCommitCheckProfileResolver } from './pre-commit-check-profile.resolver';
import type { PreCommitChecksProfile } from './pre-commit-check-profile.types';

describe('PreCommitCheckProfileResolver', () => {
  const createResolver = () => {
    const settingsService = {
      getPreCommitChecksDefaultForUserOrNull: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    const configService = {
      get: jest.fn((_: string, defaultValue?: string) => defaultValue),
    } as unknown as jest.Mocked<ConfigService>;

    return {
      resolver: new PreCommitCheckProfileResolver(
        settingsService,
        configService,
      ),
      settingsService,
      configService,
    };
  };

  const buildProfile = (): PreCommitChecksProfile => ({
    enabled: true,
    mode: 'warn',
    runner: {
      type: 'compose_service',
      service: 'app',
    },
    steps: [
      { preset: 'format', enabled: true },
      { preset: 'lint', enabled: false },
      { preset: 'test', enabled: true },
    ],
  });

  const buildRepository = (
    profile: PreCommitChecksProfile | null,
  ): ManagedRepository => {
    return {
      id: 'repo-1',
      userId: 'user-1',
      fullName: 'owner/repo',
      cloneUrl: 'https://github.com/owner/repo.git',
      defaultBranch: 'main',
      localPath: '/tmp/repo',
      isCloned: true,
      preCommitChecksOverride: profile,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ManagedRepository;
  };

  afterEach(() => {
    delete process.env.EXECUTION_PRE_PR_CHECK_COMMAND;
  });

  it('prefers repository override over user default', async () => {
    const profile = buildProfile();
    const { resolver, settingsService } = createResolver();
    settingsService.getPreCommitChecksDefaultForUserOrNull = jest
      .fn()
      .mockResolvedValue(buildProfile());

    const result = await resolver.resolve('user-1', buildRepository(profile));

    expect(result).toEqual({
      source: 'repository',
      profile,
      legacyCommand: null,
    });
  });

  it('uses user default when repository override is missing', async () => {
    const userProfile = buildProfile();
    const { resolver, settingsService } = createResolver();
    settingsService.getPreCommitChecksDefaultForUserOrNull = jest
      .fn()
      .mockResolvedValue(userProfile);

    const result = await resolver.resolve('user-1', buildRepository(null));

    expect(result).toEqual({
      source: 'user_default',
      profile: userProfile,
      legacyCommand: null,
    });
  });

  it('falls back to legacy env command when no profile exists', async () => {
    const { resolver, settingsService, configService } = createResolver();
    settingsService.getPreCommitChecksDefaultForUserOrNull = jest
      .fn()
      .mockResolvedValue(null);
    configService.get = jest.fn().mockReturnValue('npm run format:check');

    const result = await resolver.resolve('user-1', buildRepository(null));

    expect(result).toEqual({
      source: 'legacy_env',
      profile: null,
      legacyCommand: 'npm run format:check',
    });
  });

  it('returns none when no profiles and no legacy command are configured', async () => {
    const { resolver, settingsService, configService } = createResolver();
    settingsService.getPreCommitChecksDefaultForUserOrNull = jest
      .fn()
      .mockResolvedValue(null);
    configService.get = jest.fn().mockReturnValue('');

    const result = await resolver.resolve('user-1', buildRepository(null));

    expect(result).toEqual({
      source: 'none',
      profile: null,
      legacyCommand: null,
    });
  });
});
