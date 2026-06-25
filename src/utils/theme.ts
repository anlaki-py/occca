// Theme colors ported from Claude Code's dark theme
// Source: src/utils/theme.ts darkTheme

import chalk from 'chalk';

const RGB = {
  brand:       'rgb(215,119,87)',
  permission:  'rgb(177,185,249)',
  text:        'rgb(255,255,255)',
  inactive:    'rgb(153,153,153)',
  subtle:      'rgb(80,80,80)',
  success:     'rgb(78,186,101)',
  error:       'rgb(255,107,128)',
  warning:     'rgb(255,193,7)',
  suggestion:  'rgb(177,185,249)',
  bashBorder:  'rgb(253,93,177)',
};

// Helper to parse rgb(...) string to chalk
function rgb(color: string): ReturnType<typeof chalk.rgb> {
  const m = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (m) return chalk.rgb(parseInt(m[1]!), parseInt(m[2]!), parseInt(m[3]!));
  return chalk.white;
}

export const c = {
  brand:      rgb(RGB.brand),
  brandBold:  rgb(RGB.brand).bold,
  permission: rgb(RGB.permission),
  text:       rgb(RGB.text),
  inactive:   rgb(RGB.inactive),
  subtle:     rgb(RGB.subtle),
  success:    rgb(RGB.success),
  error:      rgb(RGB.error),
  warning:    rgb(RGB.warning),
  suggestion: rgb(RGB.suggestion),
  bash:       rgb(RGB.bashBorder),
};
