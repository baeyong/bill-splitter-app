// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @anthropic-ai/sdk has a circular import (beta/messages -> BetaToolRunner ->
// beta -> beta/messages). Its ESM build re-exports BetaToolRunner through a
// getter that Metro reads before the import is bound, crashing at startup with
// "Cannot read property 'BetaToolRunner' of undefined". The CommonJS build
// binds each require before defining its getter, so resolve the package as if
// it were require()d — that selects the "require" export condition.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@anthropic-ai/sdk' || moduleName.startsWith('@anthropic-ai/sdk/')) {
    return context.resolveRequest({ ...context, isESMImport: false }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
