// Rendering palette only; hazard codes, thresholds and route costs are unchanged.
export const DISPLAY_RISK_COLORS={dry:'#30916f',wet:'#dea923',deep:'#cf4c47',unknown:'#9aa9b0',closed:'#927c9b'};
export const displayRiskColor=code=>DISPLAY_RISK_COLORS[code]||DISPLAY_RISK_COLORS.unknown;
