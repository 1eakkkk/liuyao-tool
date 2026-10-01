import {upgradeOverviewText} from '../../src/core/overview.js';
// Frozen evidence stays untouched. A cast comparison permits one named field,
// never a recursive rewrite of questions, answers, or arbitrary extensions.
export function overviewPresentation(value){
  if(value && typeof value==='object' && !Array.isArray(value) &&
    Object.hasOwn(value,'overallTrendText')) return {...value,overallTrendText:upgradeOverviewText(value.overallTrendText)};
  return value;
}

const summaryLabel='证据速览（月令旺衰/回头生克/世应生克的收敛度参考，不是吉凶结论）：';
// Only the final, generated summary line in a formatted cast data block changes.
export function overviewCastText(text){
  const marker='\n\n'+summaryLabel,start=text.lastIndexOf(marker);
  if(start<0)return text;
  const summaryStart=start+marker.length,summary=text.slice(summaryStart);
  if(summary.includes('\n'))return text;
  return text.slice(0,summaryStart)+upgradeOverviewText(summary);
}
export function overviewPlateHtml(html){
  return html.replace(/(<div class="gua-trend-row">证据速览：)([^<]*)(<\/div>)/g,
    (whole,start,summary,end)=>start+upgradeOverviewText(summary)+end);
}

function generatedDataBlock(text,startMarker,endMarker){
  const start=text.indexOf(startMarker);
  if(start<0)return text;
  const dataStart=start+startMarker.length,end=text.indexOf(endMarker,dataStart);
  if(end<0)return text;
  return text.slice(0,dataStart)+overviewCastText(text.slice(dataStart,end))+text.slice(end);
}
export function overviewExportPrompt(text){
  return generatedDataBlock(text,'======== 本次排盘数据与提问 ========\n排盘数据：\n','\n\n提问者的问题是：');
}
export function overviewApiRequest(request){
  // Only the initial legacy user message contains program-generated cast data.
  // System, assistant, follow-up user messages and all other request fields stay exact.
  if(!Array.isArray(request.messages) || request.messages[1]?.role!=='user' ||
    !request.messages[1].content?.startsWith('排盘数据：\n'))return request;
  const messages=request.messages.slice();
  messages[1]={...messages[1],content:generatedDataBlock(messages[1].content,'排盘数据：\n','\n\n提问者的问题是：')};
  return {...request,messages};
}
