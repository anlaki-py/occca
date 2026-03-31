// Theme colors ported from Claude Code's dark theme
// Source: src/utils/theme.ts darkTheme

import chalk from 'chalk';

// Raw RGB values from Claude Code's darkTheme
export const theme = {
  brand:       'rgb(215,119,87)',     // Claude orange -- main brand color
  brandShimmer:'rgb(235,159,127)',    // Lighter brand for emphasis
  permission:  'rgb(177,185,249)',    // Blue-purple for prompts/info
  text:        'rgb(255,255,255)',    // White text
  inactive:    'rgb(153,153,153)',    // Gray for dim/secondary
  subtle:      'rgb(80,80,80)',       // Dark gray for borders
  success:     'rgb(78,186,101)',     // Green
  error:       'rgb(255,107,128)',    // Bright red
  warning:     'rgb(255,193,7)',      // Amber
  suggestion:  'rgb(177,185,249)',    // Blue-purple
  bashBorder:  'rgb(253,93,177)',     // Pink for bash commands
  diffAdded:   'rgb(34,92,43)',       // Dark green
  diffRemoved: 'rgb(122,41,54)',      // Dark red
};

// Helper to parse rgb(...) string to chalk
function rgb(color: string): ReturnType<typeof chalk.rgb> {
  const m = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (m) return chalk.rgb(parseInt(m[1]!), parseInt(m[2]!), parseInt(m[3]!));
  return chalk.white;
}

// Pre-built chalk color functions
export const c = {
  brand:      rgb(theme.brand),
  brandBold:  rgb(theme.brand).bold,
  permission: rgb(theme.permission),
  text:       rgb(theme.text),
  inactive:   rgb(theme.inactive),
  subtle:     rgb(theme.subtle),
  success:    rgb(theme.success),
  error:      rgb(theme.error),
  warning:    rgb(theme.warning),
  suggestion: rgb(theme.suggestion),
  bash:       rgb(theme.bashBorder),
};
