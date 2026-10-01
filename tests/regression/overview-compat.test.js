// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import {overviewPresentation,overviewCastText,overviewPlateHtml,overviewExportPrompt,overviewApiRequest} from './overview-compat.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/casts.json',import.meta.url)))[0].expected;
const old=fixture.cast.overallTrendText;
const revised=overviewPresentation(fixture.cast).overallTrendText;
const label='证据速览（月令旺衰/回头生克/世应生克的收敛度参考，不是吉凶结论）：';

test('cast compatibility changes only the named summary field without mutating frozen input',()=>{
  const cast={...fixture.cast,question:old,raw:old,extension:{overallTrendText:old},lines:[{raw:old}]};
  const before=JSON.stringify(cast),result=overviewPresentation(cast);
  expect(revised).not.toBe(old);
  expect(result).toEqual({...cast,overallTrendText:revised});
  expect(JSON.stringify(cast)).toBe(before);
  for(const value of [old,[{overallTrendText:old}],{raw:old,question:old}, {cast:fixture.cast}])expect(overviewPresentation(value)).toBe(value);
});
test('formatted data permits only the final generated summary line',()=>{
  const data=old+'\n'+fixture.text;
  expect(overviewCastText(data)).toBe(old+'\n'+fixture.text.replace(label+old,label+revised));
  expect(overviewCastText(data+'\nraw: '+old)).toBe(data+'\nraw: '+old);
  expect(overviewCastText(old)).toBe(old);
});
test('plate compatibility leaves matching text outside its summary element exact',()=>{
  const html=`<p>${old}</p>`+fixture.plate+`<div class="answer">${old}</div>`;
  expect(overviewPlateHtml(html)).toBe(`<p>${old}</p>`+fixture.plate.replace('证据速览：'+old,'证据速览：'+revised)+`<div class="answer">${old}</div>`);
});
test('export compatibility preserves rules and user question containing the old summary',()=>{
  const text=old+'\n'+fixture.export.replace(/提问者的问题是：[^\n]*/,`提问者的问题是：${old}\n\n${label}${old}`);
  expect(overviewExportPrompt(text)).toBe(text.replace(label+old,label+revised));
  expect(overviewExportPrompt(old)).toBe(old);
});
test('API compatibility changes only generated data in the initial user message',()=>{
  const question=old+'\n\n'+label+old;
  const request={model:old,raw:old,messages:[
    {role:'system',content:old},
    {role:'user',content:`排盘数据：\n${fixture.text}\n\n提问者的问题是：${question}\n\n请结合以上排盘数据给出解卦回复。`},
    {role:'assistant',content:old},
    {role:'user',content:`排盘数据：\n${fixture.text}\n\n提问者的问题是：${old}`},
  ]};
  const before=JSON.stringify(request),result=overviewApiRequest(request);
  const expected=structuredClone(request);
  expected.messages[1].content=expected.messages[1].content.replace(label+old,label+revised);
  expect(result).toEqual(expected);expect(JSON.stringify(request)).toBe(before);
  expect(result.messages.slice(2)).toEqual(request.messages.slice(2));
});
test('unknown API shapes and missing boundaries stay exact',()=>{
  for(const messages of [[],[{role:'user',content:fixture.text}], [{role:'system',content:old},{role:'assistant',content:fixture.text}],
    [{role:'system',content:old},{role:'user',content:'排盘数据：\n'+fixture.text}]]) {
    const request={messages};expect(overviewApiRequest(request)).toEqual(request);
  }
});
