// Rendering palette only; hazard codes, thresholds and route costs are unchanged.
export const DISPLAY_RISK_COLORS={dry:'#4d9e86',wet:'#dfb348',deep:'#d56d61',unknown:'#9aa9b0',closed:'#927c9b'};
export const displayRiskColor=code=>DISPLAY_RISK_COLORS[code]||DISPLAY_RISK_COLORS.unknown;
