import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  LocReport,
  PackageJson,
  ProjectConfidence,
  ProjectReport,
  ProjectSignal,
} from './types.js';

const DISCOVERY_IGNORES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'target',
  'bin',
  'obj',
]);

async function discoverFiles(
  root: string,
  maxDepth = 3,
): Promise<readonly string[]> {
  const files: string[] = [];

  async function visit(directory: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path
        .relative(root, fullPath)
        .split(path.sep)
        .join('/');

      if (entry.isDirectory()) {
        if (depth < maxDepth && !DISCOVERY_IGNORES.has(entry.name)) {
          await visit(fullPath, depth + 1);
        }
        continue;
      }

      if (entry.isFile()) files.push(relativePath);
    }
  }

  await visit(root, 0);
  return files.sort((a, b) => a.localeCompare(b));
}

async function readProjectFile(
  root: string,
  relativePath: string | null,
  maxBytes = 512 * 1024,
): Promise<string> {
  if (!relativePath) return '';
  try {
    const value = await readFile(path.join(root, relativePath), 'utf8');
    return value.slice(0, maxBytes);
  } catch {
    return '';
  }
}

function dependencySet(pkg: PackageJson | null): Set<string> {
  return new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
    ...Object.keys(pkg?.peerDependencies ?? {}),
    ...Object.keys(pkg?.optionalDependencies ?? {}),
  ]);
}

function hasAny(deps: ReadonlySet<string>, names: readonly string[]): boolean {
  return names.some((name) => deps.has(name));
}

function includesAny(value: string, needles: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function findFirst(files: readonly string[], matcher: RegExp): string | null {
  return files.find((file) => matcher.test(file)) ?? null;
}

function topExtension(loc: LocReport): string | null {
  return Object.keys(loc.byExtension)[0] ?? null;
}

function languageShare(loc: LocReport, extensions: readonly string[]): number {
  const lines = extensions.reduce(
    (sum, extension) => sum + (loc.byExtension[extension]?.nonEmpty ?? 0),
    0,
  );
  return lines / Math.max(1, loc.nonEmpty);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function detectProjectType(
  root: string,
  pkg: PackageJson | null,
  loc: LocReport,
): Promise<ProjectReport> {
  const deps = dependencySet(pkg);
  const files = await discoverFiles(root);
  const fileSet = new Set(files.map((file) => file.toLowerCase()));
  const has = (relativePath: string): boolean =>
    fileSet.has(relativePath.toLowerCase());
  const first = (matcher: RegExp): string | null => findFirst(files, matcher);

  const cargoFile = has('Cargo.toml') ? 'Cargo.toml' : first(/\/Cargo\.toml$/i);
  const csprojFile = first(/\.(?:cs|fs|vb)proj$/i);
  const solutionFile = first(/\.(?:sln|slnx)$/i);
  const pyprojectFile = has('pyproject.toml') ? 'pyproject.toml' : null;
  const pomFile = has('pom.xml') ? 'pom.xml' : first(/\/pom\.xml$/i);
  const gradleFile =
    (has('build.gradle.kts') && 'build.gradle.kts') ||
    (has('build.gradle') && 'build.gradle') ||
    first(/\/build\.gradle(?:\.kts)?$/i);
  const composerFile = has('composer.json') ? 'composer.json' : null;
  const gemFile = has('Gemfile') ? 'Gemfile' : null;
  const pubspecFile = has('pubspec.yaml') ? 'pubspec.yaml' : null;
  const packageSwiftFile = has('Package.swift') ? 'Package.swift' : null;

  const [
    cargoText,
    csprojText,
    pyprojectText,
    pomText,
    gradleText,
    composerText,
    gemText,
    pubspecText,
  ] = await Promise.all([
    readProjectFile(root, cargoFile),
    readProjectFile(root, csprojFile),
    readProjectFile(root, pyprojectFile),
    readProjectFile(root, pomFile),
    readProjectFile(root, gradleFile),
    readProjectFile(root, composerFile),
    readProjectFile(root, gemFile),
    readProjectFile(root, pubspecFile),
  ]);

  const traits: string[] = [];
  const detectedFiles: string[] = [];
  const signals: ProjectSignal[] = [];
  const addTrait = (trait: string): void => {
    if (!traits.includes(trait)) traits.push(trait);
  };
  const addFile = (file: string | null): void => {
    if (file && !detectedFiles.includes(file)) detectedFiles.push(file);
  };
  const addSignal = (label: string, detail: string, source: string): void => {
    if (
      !signals.some(
        (signal) =>
          signal.label === label &&
          signal.detail === detail &&
          signal.source === source,
      )
    ) {
      signals.push({ label, detail, source });
    }
  };

  for (const candidate of [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'Cargo.toml',
    'Cargo.lock',
    'go.mod',
    'go.work',
    'pyproject.toml',
    'requirements.txt',
    'uv.lock',
    'poetry.lock',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
    'composer.json',
    'Gemfile',
    'pubspec.yaml',
    'Package.swift',
    'CMakeLists.txt',
    'meson.build',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
  ]) {
    if (has(candidate)) addFile(candidate);
  }
  addFile(cargoFile);
  addFile(csprojFile);
  addFile(solutionFile);
  addFile(pomFile);
  addFile(gradleFile);

  const javascriptManager = await (async (): Promise<string | null> => {
    if (has('pnpm-lock.yaml')) return 'pnpm';
    if (has('yarn.lock')) return 'yarn';
    if (has('bun.lockb') || has('bun.lock')) return 'bun';
    if (has('package-lock.json') || has('npm-shrinkwrap.json')) return 'npm';
    return pkg ? 'unknown JavaScript manager' : null;
  })();

  const jsMonorepo =
    Boolean(pkg?.workspaces) ||
    has('pnpm-workspace.yaml') ||
    hasAny(deps, ['turbo', 'nx', 'lerna']);
  const cargoWorkspace = /\[workspace\]/i.test(cargoText);
  const dotnetWorkspace = Boolean(solutionFile);
  const goWorkspace = has('go.work');
  const gradleWorkspace = has('settings.gradle') || has('settings.gradle.kts');
  const isMonorepo =
    jsMonorepo ||
    cargoWorkspace ||
    dotnetWorkspace ||
    goWorkspace ||
    gradleWorkspace;
  if (isMonorepo) addTrait('workspace / monorepo');

  const hasTypeScript =
    deps.has('typescript') ||
    has('tsconfig.json') ||
    languageShare(loc, ['.ts', '.tsx', '.mts', '.cts']) > 0;
  if (hasTypeScript) addTrait('TypeScript');

  if (
    has('Dockerfile') ||
    has('docker-compose.yml') ||
    has('docker-compose.yaml')
  )
    addTrait('containerized');
  if (files.some((file) => /^\.github\/workflows\//i.test(file)))
    addTrait('GitHub Actions');
  if (files.some((file) => /(^|\/)tests?\//i.test(file))) addTrait('tests');

  let primary = 'Unknown project';
  let ecosystem = 'Unknown';
  let framework: string | null = null;
  let kind = 'source-code project';
  let packageManager: string | null = javascriptManager;
  let confidence: ProjectConfidence = 'low';

  const tauriConfig =
    (has('src-tauri/tauri.conf.json') && 'src-tauri/tauri.conf.json') ||
    (has('src-tauri/tauri.conf.json5') && 'src-tauri/tauri.conf.json5') ||
    (has('src-tauri/Tauri.toml') && 'src-tauri/Tauri.toml') ||
    null;
  const isTauri =
    Boolean(tauriConfig) ||
    hasAny(deps, ['@tauri-apps/api', '@tauri-apps/cli']) ||
    /(?:^|\W)tauri(?:\W|$)/i.test(cargoText);

  if (isTauri) {
    primary = 'Tauri desktop application';
    ecosystem = pkg ? 'Rust + JavaScript' : 'Rust';
    framework = 'Tauri';
    kind = 'desktop application';
    packageManager = unique([javascriptManager ?? '', 'Cargo']).join(' + ');
    confidence = 'high';
    addTrait('native desktop shell');
    if (pkg) addTrait('web frontend');
    addFile(tauriConfig);
    addSignal(
      'Framework',
      'Tauri desktop shell detected',
      tauriConfig ??
        (deps.has('@tauri-apps/api')
          ? 'package.json'
          : (cargoFile ?? 'Cargo.toml')),
    );
    if (cargoFile)
      addSignal('Native backend', 'Rust crate is present', cargoFile);
  } else if (
    has('ProjectSettings/ProjectVersion.txt') &&
    files.some((file) => /^Assets\//i.test(file))
  ) {
    primary = 'Unity game project';
    ecosystem = 'C# / Unity';
    framework = 'Unity';
    kind = 'game';
    packageManager = 'Unity Package Manager';
    confidence = 'high';
    addTrait('game engine');
    addSignal(
      'Engine',
      'Unity project structure detected',
      'ProjectSettings/ProjectVersion.txt',
    );
  } else if (
    csprojFile ||
    solutionFile ||
    languageShare(loc, ['.cs', '.fs', '.vb']) > 0.5
  ) {
    ecosystem = 'Microsoft .NET';
    packageManager = '.NET SDK / NuGet';
    confidence = csprojFile || solutionFile ? 'high' : 'medium';
    addTrait('managed .NET');

    if (/<UseMaui>\s*true\s*<\/UseMaui>/i.test(csprojText)) {
      primary = '.NET MAUI application';
      framework = '.NET MAUI';
      kind = 'cross-platform application';
      addTrait('mobile / desktop');
    } else if (/Microsoft\.NET\.Sdk\.BlazorWebAssembly/i.test(csprojText)) {
      primary = 'Blazor WebAssembly application';
      framework = 'Blazor';
      kind = 'web frontend';
    } else if (/Microsoft\.NET\.Sdk\.Web/i.test(csprojText)) {
      primary = 'ASP.NET Core application';
      framework = 'ASP.NET Core';
      kind = 'web backend';
    } else if (/<UseWPF>\s*true\s*<\/UseWPF>/i.test(csprojText)) {
      primary = 'WPF desktop application';
      framework = 'WPF';
      kind = 'desktop application';
    } else if (
      /<UseWindowsForms>\s*true\s*<\/UseWindowsForms>/i.test(csprojText)
    ) {
      primary = 'Windows Forms application';
      framework = 'Windows Forms';
      kind = 'desktop application';
    } else if (/Microsoft\.NET\.Test\.Sdk/i.test(csprojText)) {
      primary = '.NET test project';
      kind = 'test project';
    } else if (
      /<OutputType>\s*(?:Exe|WinExe)\s*<\/OutputType>/i.test(csprojText)
    ) {
      primary = '.NET application';
      kind = 'application';
    } else {
      primary = dotnetWorkspace
        ? '.NET solution'
        : '.NET library / application';
      kind = dotnetWorkspace
        ? 'solution / workspace'
        : 'library or application';
    }
    addSignal(
      'Toolchain',
      solutionFile
        ? '.NET solution file detected'
        : '.NET project file detected',
      solutionFile ?? csprojFile ?? 'C# source files',
    );
    if (framework)
      addSignal(
        'Framework',
        `${framework} markers detected`,
        csprojFile ?? 'project file',
      );
  } else if (cargoFile || languageShare(loc, ['.rs']) > 0.5) {
    ecosystem = 'Rust';
    packageManager = 'Cargo';
    confidence = cargoFile ? 'high' : 'medium';
    const rustMain =
      has('src/main.rs') ||
      files.some((file) => /\/src\/main\.rs$/i.test(file));
    const rustLib =
      has('src/lib.rs') || files.some((file) => /\/src\/lib\.rs$/i.test(file));

    if (includesAny(cargoText, ['bevy'])) {
      primary = 'Bevy game project';
      framework = 'Bevy';
      kind = 'game';
    } else if (includesAny(cargoText, ['axum', 'actix-web', 'rocket'])) {
      const selected = includesAny(cargoText, ['axum'])
        ? 'Axum'
        : includesAny(cargoText, ['actix-web'])
          ? 'Actix Web'
          : 'Rocket';
      primary = `${selected} Rust backend`;
      framework = selected;
      kind = 'web backend';
    } else if (cargoWorkspace) {
      primary = 'Rust Cargo workspace';
      kind = 'workspace / monorepo';
    } else if (
      rustMain &&
      includesAny(cargoText, ['clap', 'argh', 'structopt'])
    ) {
      primary = 'Rust CLI application';
      kind = 'command-line application';
    } else if (rustLib && !rustMain) {
      primary = 'Rust library crate';
      kind = 'library';
    } else if (rustMain) {
      primary = 'Rust application';
      kind = 'application';
    } else {
      primary = 'Rust crate';
      kind = 'library or application';
    }
    addTrait('native compiled');
    addSignal(
      'Toolchain',
      'Cargo project detected',
      cargoFile ?? 'Rust source files',
    );
    if (framework)
      addSignal(
        'Framework',
        `${framework} dependency detected`,
        cargoFile ?? 'Cargo.toml',
      );
  } else if (pubspecFile && includesAny(pubspecText, ['flutter:'])) {
    primary = 'Flutter application';
    ecosystem = 'Dart / Flutter';
    framework = 'Flutter';
    kind = 'cross-platform application';
    packageManager = 'pub';
    confidence = 'high';
    addTrait('mobile / desktop / web');
    addSignal('Framework', 'Flutter SDK dependency detected', pubspecFile);
  } else if (has('go.mod') || languageShare(loc, ['.go']) > 0.5) {
    ecosystem = 'Go';
    packageManager = 'Go modules';
    confidence = has('go.mod') ? 'high' : 'medium';
    if (files.some((file) => /^cmd\//i.test(file))) {
      primary = goWorkspace ? 'Go workspace' : 'Go application / CLI';
      kind = goWorkspace ? 'workspace / monorepo' : 'application';
    } else {
      primary = 'Go module';
      kind = 'service, application, or library';
    }
    addTrait('native compiled');
    addSignal(
      'Toolchain',
      'Go module detected',
      has('go.mod') ? 'go.mod' : 'Go source files',
    );
  } else if (
    pyprojectFile ||
    has('requirements.txt') ||
    has('setup.py') ||
    languageShare(loc, ['.py']) > 0.5
  ) {
    ecosystem = 'Python';
    confidence =
      pyprojectFile || has('requirements.txt') || has('setup.py')
        ? 'high'
        : 'medium';
    if (has('uv.lock')) packageManager = 'uv';
    else if (has('poetry.lock') || /\[tool\.poetry\]/i.test(pyprojectText))
      packageManager = 'Poetry';
    else if (/\[tool\.pdm\]/i.test(pyprojectText)) packageManager = 'PDM';
    else packageManager = 'pip / Python packaging';

    const requirementsText = await readProjectFile(
      root,
      has('requirements.txt') ? 'requirements.txt' : null,
    );
    const pythonMetadata = `${pyprojectText}\n${requirementsText}`;
    if (has('manage.py') || includesAny(pythonMetadata, ['django'])) {
      primary = 'Django application';
      framework = 'Django';
      kind = 'web application';
    } else if (includesAny(pythonMetadata, ['fastapi'])) {
      primary = 'FastAPI backend';
      framework = 'FastAPI';
      kind = 'web backend';
    } else if (includesAny(pythonMetadata, ['flask'])) {
      primary = 'Flask application';
      framework = 'Flask';
      kind = 'web backend';
    } else if (/\[project\.scripts\]|console_scripts/i.test(pyprojectText)) {
      primary = 'Python CLI package';
      kind = 'command-line application';
    } else {
      primary = 'Python package / application';
      kind = 'package or application';
    }
    addSignal(
      'Toolchain',
      'Python project metadata detected',
      pyprojectFile ??
        (has('requirements.txt') ? 'requirements.txt' : 'Python source files'),
    );
    if (framework)
      addSignal(
        'Framework',
        `${framework} marker detected`,
        pyprojectFile ?? 'requirements.txt',
      );
  } else if (
    pomFile ||
    gradleFile ||
    languageShare(loc, ['.java', '.kt', '.kts']) > 0.5
  ) {
    ecosystem =
      languageShare(loc, ['.kt', '.kts']) > languageShare(loc, ['.java'])
        ? 'Kotlin / JVM'
        : 'Java / JVM';
    packageManager = pomFile
      ? 'Maven'
      : gradleFile
        ? 'Gradle'
        : 'JVM build tools';
    confidence = pomFile || gradleFile ? 'high' : 'medium';
    const buildText = `${pomText}\n${gradleText}`;
    if (includesAny(buildText, ['spring-boot'])) {
      primary = 'Spring Boot application';
      framework = 'Spring Boot';
      kind = 'web backend';
    } else if (
      includesAny(buildText, ['com.android.application', 'androidx.'])
    ) {
      primary = 'Android application';
      framework = 'Android';
      kind = 'mobile application';
    } else {
      primary = `${ecosystem} project`;
      kind = 'application or library';
    }
    addSignal(
      'Toolchain',
      `${packageManager} project detected`,
      pomFile ?? gradleFile ?? 'JVM source files',
    );
    if (framework)
      addSignal(
        'Framework',
        `${framework} marker detected`,
        pomFile ?? gradleFile ?? 'build file',
      );
  } else if (composerFile || languageShare(loc, ['.php']) > 0.5) {
    ecosystem = 'PHP';
    packageManager = 'Composer';
    confidence = composerFile ? 'high' : 'medium';
    if (has('artisan') || includesAny(composerText, ['laravel/framework'])) {
      primary = 'Laravel application';
      framework = 'Laravel';
      kind = 'web application';
    } else if (includesAny(composerText, ['symfony/framework-bundle'])) {
      primary = 'Symfony application';
      framework = 'Symfony';
      kind = 'web application';
    } else {
      primary = 'PHP package / application';
      kind = 'package or application';
    }
    addSignal(
      'Toolchain',
      'Composer project detected',
      composerFile ?? 'PHP source files',
    );
  } else if (gemFile || languageShare(loc, ['.rb']) > 0.5) {
    ecosystem = 'Ruby';
    packageManager = 'Bundler';
    confidence = gemFile ? 'high' : 'medium';
    if (
      has('bin/rails') ||
      has('config/application.rb') ||
      includesAny(gemText, ['rails'])
    ) {
      primary = 'Ruby on Rails application';
      framework = 'Ruby on Rails';
      kind = 'web application';
    } else {
      primary = 'Ruby application / gem';
      kind = 'application or library';
    }
    addSignal(
      'Toolchain',
      'Ruby Bundler project detected',
      gemFile ?? 'Ruby source files',
    );
  } else if (
    packageSwiftFile ||
    first(/\.xcodeproj\/project\.pbxproj$/i) ||
    languageShare(loc, ['.swift']) > 0.5
  ) {
    ecosystem = 'Swift';
    packageManager = packageSwiftFile ? 'Swift Package Manager' : 'Xcode';
    confidence =
      packageSwiftFile || first(/\.xcodeproj\/project\.pbxproj$/i)
        ? 'high'
        : 'medium';
    primary = first(/\.xcodeproj\/project\.pbxproj$/i)
      ? 'Apple platform application'
      : 'Swift package / application';
    kind = first(/\.xcodeproj\/project\.pbxproj$/i)
      ? 'mobile or desktop application'
      : 'package or application';
    addTrait('native compiled');
    addSignal(
      'Toolchain',
      `${packageManager} project detected`,
      packageSwiftFile ??
        first(/\.xcodeproj\/project\.pbxproj$/i) ??
        'Swift source files',
    );
  } else if (has('project.godot')) {
    primary = 'Godot game project';
    ecosystem = 'Godot';
    framework = 'Godot';
    kind = 'game';
    packageManager = null;
    confidence = 'high';
    addTrait('game engine');
    addSignal('Engine', 'Godot project file detected', 'project.godot');
  } else if (
    has('CMakeLists.txt') ||
    has('meson.build') ||
    languageShare(loc, ['.c', '.h', '.cc', '.cpp', '.hpp']) > 0.5
  ) {
    const cppShare = languageShare(loc, ['.cc', '.cpp', '.hpp']);
    ecosystem = cppShare > 0 ? 'C / C++' : 'C';
    packageManager = has('CMakeLists.txt')
      ? 'CMake'
      : has('meson.build')
        ? 'Meson'
        : 'native build tools';
    confidence =
      has('CMakeLists.txt') || has('meson.build') ? 'high' : 'medium';
    primary = `${ecosystem} project`;
    kind = 'native application or library';
    addTrait('native compiled');
    addSignal(
      'Toolchain',
      `${packageManager} project detected`,
      has('CMakeLists.txt')
        ? 'CMakeLists.txt'
        : has('meson.build')
          ? 'meson.build'
          : 'C/C++ source files',
    );
  } else if (pkg) {
    ecosystem = 'JavaScript / Node.js';
    confidence = 'high';
    kind = 'application or package';

    if (deps.has('next')) {
      primary = 'Next.js application';
      framework = 'Next.js';
      kind = 'full-stack web application';
    } else if (deps.has('nuxt')) {
      primary = 'Nuxt application';
      framework = 'Nuxt';
      kind = 'full-stack web application';
    } else if (hasAny(deps, ['@remix-run/node', '@remix-run/react'])) {
      primary = 'Remix application';
      framework = 'Remix';
      kind = 'full-stack web application';
    } else if (deps.has('@sveltejs/kit')) {
      primary = 'SvelteKit application';
      framework = 'SvelteKit';
      kind = 'full-stack web application';
    } else if (deps.has('@angular/core')) {
      primary = 'Angular application';
      framework = 'Angular';
      kind = 'web frontend';
    } else if (deps.has('astro')) {
      primary = 'Astro application';
      framework = 'Astro';
      kind = 'content-focused web application';
    } else if (deps.has('expo')) {
      primary = 'Expo / React Native application';
      framework = 'Expo';
      kind = 'mobile application';
    } else if (deps.has('react-native')) {
      primary = 'React Native application';
      framework = 'React Native';
      kind = 'mobile application';
    } else if (deps.has('electron')) {
      primary = 'Electron desktop application';
      framework = 'Electron';
      kind = 'desktop application';
    } else if (deps.has('@nestjs/core')) {
      primary = 'NestJS backend';
      framework = 'NestJS';
      kind = 'web backend';
    } else if (deps.has('@adonisjs/core')) {
      primary = 'AdonisJS backend';
      framework = 'AdonisJS';
      kind = 'web backend';
    } else if (
      hasAny(deps, ['express', 'fastify', 'koa', 'hapi', '@hapi/hapi', 'hono'])
    ) {
      primary = 'Node.js backend';
      framework = deps.has('fastify')
        ? 'Fastify'
        : deps.has('hono')
          ? 'Hono'
          : deps.has('express')
            ? 'Express'
            : null;
      kind = 'web backend';
    } else if (deps.has('react') && deps.has('vite')) {
      primary = 'React + Vite frontend';
      framework = 'React + Vite';
      kind = 'web frontend';
    } else if (deps.has('vue') && deps.has('vite')) {
      primary = 'Vue + Vite frontend';
      framework = 'Vue + Vite';
      kind = 'web frontend';
    } else if (deps.has('solid-js')) {
      primary = 'SolidJS frontend';
      framework = 'SolidJS';
      kind = 'web frontend';
    } else if (deps.has('svelte')) {
      primary = 'Svelte frontend';
      framework = 'Svelte';
      kind = 'web frontend';
    } else if (deps.has('react')) {
      primary = 'React frontend / library';
      framework = 'React';
      kind = 'web frontend or library';
    } else if (deps.has('vue')) {
      primary = 'Vue frontend / library';
      framework = 'Vue';
      kind = 'web frontend or library';
    } else if (deps.has('vite')) {
      primary = 'Vite application / library';
      framework = 'Vite';
      kind = 'web application or library';
    } else if (pkg.bin) {
      primary = 'Node.js CLI package';
      kind = 'command-line application';
    } else {
      primary = 'Node.js package / application';
    }

    addSignal('Manifest', 'Node.js package metadata detected', 'package.json');
    if (framework)
      addSignal(
        'Framework',
        `${framework} dependency detected`,
        'package.json',
      );
  } else if (loc.files > 0) {
    primary = 'Source-code project';
    ecosystem = topExtension(loc)
      ? `Source files (${topExtension(loc)})`
      : 'Source code';
    kind = 'source-code project';
    confidence = 'low';
    addSignal(
      'Source',
      'Project type inferred only from source extensions',
      topExtension(loc) ?? 'source files',
    );
  }

  if (hasAny(deps, ['vitest', 'jest', 'mocha', 'ava'])) addTrait('unit tests');
  if (hasAny(deps, ['playwright', '@playwright/test', 'cypress']))
    addTrait('end-to-end tests');
  if (
    deps.has('storybook') ||
    deps.has('@storybook/react') ||
    deps.has('@storybook/vue3')
  )
    addTrait('Storybook');
  if (pkg?.private) addTrait('private package');

  const meaningfulLanguages = Object.values(loc.byExtension).filter(
    (stats) => stats.nonEmpty / Math.max(1, loc.nonEmpty) >= 0.1,
  ).length;
  if (meaningfulLanguages > 1) addTrait('multi-language');

  if (isMonorepo && kind !== 'workspace / monorepo') addTrait('multi-package');

  const languages = Object.entries(loc.byExtension)
    .slice(0, 8)
    .map(([extension, stats]) => ({
      extension,
      nonEmptyLines: stats.nonEmpty,
    }));

  return {
    primary,
    ecosystem,
    framework,
    kind,
    packageManager,
    confidence,
    traits,
    languages,
    detectedFiles: detectedFiles.slice(0, 24),
    signals: signals.slice(0, 16),
  };
}
