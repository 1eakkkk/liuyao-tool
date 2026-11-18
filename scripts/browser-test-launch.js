import {chromium,webkit} from 'playwright';

const types={chromium,webkit};
export function browserEngines(defaults=['chromium','webkit']) {
 const selected=process.env.BROWSER_ENGINES||process.env.BROWSER_ENGINE;
 const names=selected?selected.split(',').map(name=>name.trim()).filter(Boolean):defaults;
 if(!names.length||names.some(name=>!Object.hasOwn(types,name)))throw Error('BROWSER_ENGINE(S) must name chromium or webkit.');
 return [...new Set(names)];
}

export function launchBrowser(engine,target) {
 const executable=process.env.BROWSER_EXECUTABLE;
 const remote=target&&!['localhost','127.0.0.1','[::1]'].includes(new URL(target).hostname);
 return types[engine].launch({headless:true,
  ...(engine==='chromium'?(executable?{executablePath:executable}:{channel:process.env.BROWSER_CHANNEL||'msedge'}):{}),
  ...(remote&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
}

export async function selectAppPanel(page,name) {
 if(['basics','guide'].includes(name)) {
  const menu=page.locator('.learning-menu');
  if(await menu.count()&&!await menu.evaluate(node=>node.open))await menu.locator(':scope > summary').click();
 }
 await page.locator(`[data-tab="${name}"]`).click();
}

export async function openAppHelp(page) {
 if(await page.locator('#helpFab').isVisible())await page.locator('#helpFab').click();
 else {
  const menu=page.locator('.learning-menu');
  if(!await menu.evaluate(node=>node.open))await menu.locator(':scope > summary').click();
  await page.locator('#openHelpMenuBtn').click();
 }
 await page.locator('#onboardOverlay').waitFor({state:'visible'});
}
