// Expo config plugin: disable Xcode User Script Sandboxing on the iOS app.
//
// Why: starting with iOS SDK 26 / recent Xcode, USER_SCRIPT_SANDBOXING defaults
// to YES. The "[Expo] Configure project" build phase added by expo-modules-
// autolinking runs `node` and writes ExpoModulesProvider.swift to the project,
// which the sandbox blocks — archive fails with "PhaseScriptExecution [Expo]
// Configure project ... failed".
//
// Setting ENABLE_USER_SCRIPT_SANDBOXING = NO on every build configuration
// (project AND target level) lets the script phase do its job. This is the
// standard React Native / Expo workaround for the issue.
//
// This plugin runs on every `npx expo prebuild`, so the setting survives
// regenerations of the ios/ folder.

const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function withSandboxingDisabled(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const buildConfigurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigurations)) {
      const entry = buildConfigurations[key];
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
      entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
    return config;
  });
};
