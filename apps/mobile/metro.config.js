const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

// Expo auto-detecta monorepo e adiciona watchFolders com dirs que podem não
// existir. Filtramos apenas as que existem e ficamos só com o projeto.
config.watchFolders = (config.watchFolders ?? []).filter((f) => fs.existsSync(f));
if (!config.watchFolders.includes(__dirname)) {
  config.watchFolders.push(__dirname);
}

// Resolver usa apenas node_modules locais (standalone, não monorepo)
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
