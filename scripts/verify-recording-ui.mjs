import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import express from 'express';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../', import.meta.url));
const app=express(); app.use(express.static(root+'/dist')); app.get('/{*path}',(req,res)=>res.sendFile(root+'/dist/index.html',{dotfiles:'allow'}));
const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
let checks=0;
try {
for(const mode of ['candidate','recruiter']) {
 const context=await browser.newContext({viewport:{width:1280,height:1000}}); const page=await context.newPage();
 let job=null, enabled=true, submitted=null;
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
 const request=route.request(), path=new URL(request.url()).pathname; let data={};
 if(path.startsWith('/api/auth/')) data={user:{id:'browser-synthetic-user',username:'合成测试',email:null,isAdmin:false}};
 else if(path==='/api/materials/capabilities') data={audio:{enabled,maxBytes:104857600,maxDurationSeconds:3600,extensions:['.mp3','.wav','.m4a','.ogg']}};
 else if(path==='/api/materials') data=job?[job]:[];
 else if(path==='/api/materials/audio') {const body=request.postDataJSON(); job={id:'00000000-0000-4000-8000-000000000001',analysisMode:mode,source:'audio',status:'uploading',fileName:body.fileName,transcript:'',segments:[],speakerRoles:{},confirmed:false,error:null,createdAt:Date.now(),expiresAt:Date.now()+86400000,sizeBytes:body.sizeBytes,uploadedBytes:0};data=job;}
 else if(path.endsWith('/submit')) {job={...job,status:'ready',transcript:'请介绍一个项目。我负责用户访谈并改进产品流程，提高了用户使用效率。',segments:[{speaker:'A',startMs:0,endMs:1000,text:'请介绍一个项目。'},{speaker:'B',startMs:1000,endMs:4000,text:'我负责用户访谈并改进产品流程，提高了用户使用效率。'}]};data=job;}
 else if(path.includes('/materials/')&&request.method()==='PATCH'){job={...job,...request.postDataJSON(),confirmed:true};data=job;}
 else if(path==='/api/analyze'){submitted=request.postDataJSON();await route.fulfill({status:503,json:{error:'合成验收到此为止，不调用真实模型'}});return;}
 else if(path.includes('/materials/')) data=job;
 else if(path==='/api/templates') data=[];
 await route.fulfill({json:data});
 });
 await page.goto(base+'/login');
 await page.getByPlaceholder('输入用户名').fill('synthetic'); await page.getByPlaceholder('输入密码').fill('synthetic-only-password');
 if(mode==='recruiter') await page.getByRole('button',{name:/判断他人/}).click();
 else await page.getByRole('button',{name:/提升自己/}).click();
 await page.getByRole('button',{name:'登录',exact:true}).click();
 if(mode==='candidate') {await page.getByPlaceholder('例如：高级产品经理').fill('产品经理'); await page.getByRole('button',{name:/下一步：面试记录/}).click();}
 else {await page.getByPlaceholder('例如：高级前端工程师、销售总监').fill('产品经理');await page.getByPlaceholder('例如：1. 系统设计 2. 领导力 3. 冲突处理...').fill('产品判断');await page.getByRole('button',{name:/下一步：面试材料/}).click();}
 await page.getByRole('button',{name:'上传录音',exact:true}).click();
 assert.equal(await page.getByText('飞书妙记',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('飞书妙记链接').count(),0);
 await page.getByRole('checkbox').check();
 await page.getByLabel('选择面试录音').setInputFiles({name:'synthetic.wav',mimeType:'audio/wav',buffer:Buffer.from('synthetic-browser-fixture')});
 await page.getByLabel('逐字稿编辑稿').waitFor();
 await page.getByLabel('B的角色').selectOption('candidate');
 const draft=page.getByLabel('逐字稿编辑稿'); assert.match(await draft.inputValue(),/候选人（B）/);
 await draft.fill((await draft.inputValue()).replace('用户使用效率','人工修订后的效率'));
 await page.getByLabel('A的角色').selectOption('interviewer');
 assert.match(await draft.inputValue(),/人工修订后的效率/); assert.match(await draft.inputValue(),/面试官（A）/);
 await page.getByRole('button',{name:/保存确认稿并用于分析/}).click();
 await page.getByText('确认稿已保存并填入当前表单，可以继续下一步。').waitFor();
 await draft.fill((await draft.inputValue())+'补充核对。');
 await page.getByRole('button',{name:/下一步：确认/}).click();
 await page.getByText('请先保存并确认逐字稿。',{exact:true}).waitFor();
 await page.getByRole('button',{name:/保存确认稿并用于分析/}).click(); checks++;
 await page.evaluate(() => window.scrollTo(0, 0));
 await page.screenshot({path:`/tmp/evalbar-recording-${mode}.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
 await page.screenshot({path:`/tmp/evalbar-recording-${mode}-mobile.png`,fullPage:true});
 await page.setViewportSize({width:1280,height:1000});
 await page.getByRole('button',{name:/下一步：确认/}).click();
 await page.getByRole('button',{name:mode==='candidate'?'开始生成复盘报告':'开始分析',exact:true}).click();
 await page.waitForTimeout(300);
 assert.equal(submitted?.materialId,job.id); assert.match(submitted.transcript,/人工修订后的效率/);assert.match(submitted.transcript,/候选人（B）/);
 assert.deepEqual(errors,[]); checks++;
 // Verify unconfigured fallback on a fresh workbench.
 job=null;enabled=false; await page.goto(base+`/app/${mode}`);
 if(mode==='candidate'){await page.getByPlaceholder('例如：高级产品经理').fill('产品经理');await page.getByRole('button',{name:/下一步：面试记录/}).click();}
 else {await page.getByPlaceholder('例如：高级前端工程师、销售总监').fill('产品经理');await page.getByPlaceholder('例如：1. 系统设计 2. 领导力 3. 冲突处理...').fill('产品判断');await page.getByRole('button',{name:/下一步：面试材料/}).click();}
 await page.getByRole('button',{name:'上传录音',exact:true}).click(); await page.getByText('录音转写服务尚未配置。你可以继续上传文字文件或粘贴面试记录。').waitFor();
 assert.equal(await page.getByText('飞书妙记',{exact:true}).count(),0); checks++;
 console.log(mode+' browser workflow passed');await context.close();
}
console.log(`Browser scenarios passed: ${checks}; provider responses simulated; no external API calls.`);
} finally {await browser.close();server.close();}
