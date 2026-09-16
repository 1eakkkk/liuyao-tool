import { dayGanzhiSelect } from './dom.js';
import { state } from '../app/state.js';
import { getTodayJiaziIndex, buildYearMonthHourPillars, buildDateDisplayText } from '../core/ganzhi.js';
import { JIAZI60 } from '../core/constants.js';


// Browser local civil time; day changes at 00:00. No true-solar-time correction.
function resolveCastCalendar(){
  const now=state.knownCastDate ? new Date(state.knownCastDate) : new Date();
  if(state.daySelectionMode==='auto')dayGanzhiSelect.value=String(getTodayJiaziIndex(now));
  const day=JIAZI60[Number(dayGanzhiSelect.value)];
  if(state.daySelectionMode==='manual')return {now,day,ymh:{yearLabel:'未指定',monthLabel:'未指定',hourLabel:'未指定'},dateText:'公历日期未指定（仅录入日柱）'};
  const ymh=buildYearMonthHourPillars(day.stem,now);
  if(state.knownCastDate&&!document.getElementById('dayLookupTime').value){
    ymh.hourLabel='未指定';
    const end=new Date(now);end.setHours(23,59,59,999);
    const last=buildYearMonthHourPillars(day.stem,end);
    if(last.yearLabel!==ymh.yearLabel)ymh.yearLabel='交节日待定';
    if(last.monthLabel!==ymh.monthLabel)ymh.monthLabel='交节日待定';
  }
  return {now,day,ymh,dateText:buildDateDisplayText(now)};
}

export { resolveCastCalendar };
