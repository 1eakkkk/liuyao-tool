import {upgradeOverviewText} from '../../src/core/overview.js';
// Frozen evidence stays untouched. Permit only the explicit overview copy revision.
export function overviewPresentation(value){
  if(typeof value==='string')return upgradeOverviewText(value);
  if(Array.isArray(value))return value.map(overviewPresentation);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,overviewPresentation(v)]));
  return value;
}
