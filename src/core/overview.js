// Seasonal counts are not independent votes on an outcome.
export function overviewEnding(strong,weak){
  if(!Number.isInteger(strong)||!Number.isInteger(weak)||strong<0||weak<0||strong+weak>6)throw Error('Invalid seasonal counts');
  if(strong+weak!==6)return '——月令信息不足，未作全卦数量比较；不能据此判断整体吉凶';
  const count=strong===weak?'两类爻数量相同':strong>weak?'当令得力爻数量较多':'当令减力爻数量较多';
  return `——${count}；这是月令计数，不代表整体吉凶，具体判断还要结合用神与相关动变`;
}
// Upgrade only known legacy wording; preserve stored raw records.
export function upgradeOverviewText(text){
  if(typeof text!=='string')return text;
  return text.replace(/(当令得力\(旺\/相\)([0-6])爻、当令减力\(休\/囚\/死\)([0-6])爻[^\n<]*?)——(?:整体当令气象偏[旺弱]，迹象比较集中|当令得力与减力的爻数相当，旺衰不算悬殊，具体判断还要结合用神细看)/g,
    (whole,prefix,strong,weak)=>Number(strong)+Number(weak)<=6?prefix+overviewEnding(Number(strong),Number(weak)):whole);
}
