const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo so Metro can resolve shared packages.
config.watchFolders = [monorepoRoot];

// 2. Resolve packages from the package's own node_modules first, then fall
//    back to the monorepo root node_modules (for hoisted deps / pnpm shamefully-hoist).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Disable package exports field so Metro uses the classic resolution
//    strategy — avoids pnpm symlink loops that produce the
//    "Unable to resolve ./index from /home/runner/workspace/." error.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
