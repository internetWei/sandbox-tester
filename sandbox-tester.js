#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { spawn, execSync } = require('child_process');

const SANDBOX_URL = 'https://appstoreconnect.apple.com/access/users/sandbox';
// 运行时状态放 home 下，与脚本本体分离 —— 脚本可进 git/同步目录，登录态（含 Apple cookie）和依赖不随之外泄
const STATE_DIR = path.join(os.homedir(), '.local', 'state', 'sandbox-tester');
const USER_DATA_DIR = path.join(STATE_DIR, 'playwright-state');
// persistent profile 不落盘 session cookie，用它显式保存/恢复全部 cookie（含 Apple 登录的 session cookie）
const STORAGE_STATE = path.join(USER_DATA_DIR, 'storage-state.json');

const DEFAULT_PASSWORD = 'WxYz1234'; // 仅作首次设置密码时的建议示例
const DEFAULT_TERRITORY = 'USA';
const MAX_EMAIL_TRIES = 20;
// 各 Apple 账号各自的上次成功邮箱（{ appleId: email } map）；放 STATE_DIR 不随 --logout 清除
const LAST_EMAIL_FILE = path.join(STATE_DIR, 'last-email.json');
// 全局默认密码（不按账号区分，切换账号也沿用）
const PASSWORD_FILE = path.join(STATE_DIR, 'password.txt');
// 记录上次用的 Chromium channel（chrome / msedge），保证 profile 兼容、不丢登录态
const CHANNEL_FILE = path.join(STATE_DIR, 'browser-channel.txt');
// 内置地区列表（ISO alpha-3 → 中文名）：脚本初次运行用它做 -h 兜底；缓存生成后由缓存覆盖（含 Apple 最新增减）
const FALLBACK_REGIONS = [
  ["ALB","阿尔巴尼亚"], ["DZA","阿尔及利亚"], ["AFG","阿富汗"], ["ARG","阿根廷"], ["ARE","阿拉伯联合酋长国"],
  ["OMN","阿曼"], ["AZE","阿塞拜疆"], ["EGY","埃及"], ["IRL","爱尔兰"], ["EST","爱沙尼亚"],
  ["AGO","安哥拉"], ["AIA","安圭拉"], ["ATG","安提瓜和巴布达"], ["AUT","奥地利"], ["AUS","澳大利亚"],
  ["MAC","澳门"], ["BRB","巴巴多斯"], ["PNG","巴布亚新几内亚"], ["BHS","巴哈马"], ["PAK","巴基斯坦"],
  ["PRY","巴拉圭"], ["BHR","巴林"], ["PAN","巴拿马"], ["BRA","巴西"], ["BLR","白俄罗斯"],
  ["BMU","百慕大"], ["BGR","保加利亚"], ["MKD","北马其顿"], ["BEN","贝宁"], ["BEL","比利时"],
  ["ISL","冰岛"], ["POL","波兰"], ["BIH","波斯尼亚和黑塞哥维那"], ["BOL","玻利维亚"], ["BLZ","伯利兹"],
  ["BWA","博茨瓦纳"], ["BTN","不丹"], ["BFA","布基纳法索"], ["DNK","丹麦"], ["DEU","德国"],
  ["DOM","多米尼加共和国"], ["DMA","多米尼克"], ["RUS","俄罗斯联邦"], ["ECU","厄瓜多尔"], ["FRA","法国"],
  ["PHL","菲律宾"], ["FJI","斐济"], ["FIN","芬兰"], ["CPV","佛得角"], ["GMB","冈比亚"],
  ["COG","刚果共和国"], ["COD","刚果民主共和国"], ["COL","哥伦比亚"], ["CRI","哥斯达黎加"], ["GRD","格林纳达"],
  ["GEO","格鲁吉亚"], ["GUY","圭亚那"], ["KAZ","哈萨克斯坦"], ["KOR","韩国"], ["NLD","荷兰"],
  ["MNE","黑山"], ["HND","洪都拉斯"], ["KGZ","吉尔吉斯斯坦"], ["GNB","几内亚比绍"], ["CAN","加拿大"],
  ["GHA","加纳"], ["GAB","加蓬"], ["KHM","柬埔寨"], ["CZE","捷克共和国"], ["ZWE","津巴布韦"],
  ["CMR","喀麦隆"], ["QAT","卡塔尔"], ["CYM","开曼群岛"], ["XKS","科索沃"], ["CIV","科特迪瓦"],
  ["KWT","科威特"], ["HRV","克罗地亚"], ["KEN","肯尼亚"], ["LVA","拉脱维亚"], ["LAO","老挝"],
  ["LBN","黎巴嫩"], ["LTU","立陶宛"], ["LBR","利比里亚"], ["LBY","利比亚"], ["LUX","卢森堡"],
  ["RWA","卢旺达"], ["ROU","罗马尼亚"], ["MDG","马达加斯加"], ["MDV","马尔代夫"], ["MLT","马耳他"],
  ["MWI","马拉维"], ["MYS","马来西亚"], ["MLI","马里"], ["MUS","毛里求斯"], ["MRT","毛里塔尼亚"],
  ["USA","美国"], ["MNG","蒙古"], ["MSR","蒙特塞拉特"], ["PER","秘鲁"], ["FSM","密克罗尼西亚"],
  ["MMR","缅甸"], ["MDA","摩尔多瓦"], ["MAR","摩洛哥"], ["MOZ","莫桑比克"], ["MEX","墨西哥"],
  ["NAM","纳米比亚"], ["ZAF","南非"], ["NRU","瑙鲁"], ["NIC","尼加拉瓜"], ["NPL","尼泊尔"],
  ["NER","尼日尔"], ["NGA","尼日利亚"], ["NOR","挪威"], ["PLW","帕劳"], ["PRT","葡萄牙"],
  ["JPN","日本"], ["SWE","瑞典"], ["CHE","瑞士"], ["SLV","萨尔瓦多"], ["SRB","塞尔维亚"],
  ["SLE","塞拉利昂"], ["SEN","塞内加尔"], ["CYP","塞浦路斯"], ["SYC","塞舌尔"], ["SAU","沙特阿拉伯"],
  ["STP","圣多美和普林西比"], ["KNA","圣基茨和尼维斯"], ["LCA","圣卢西亚"], ["VCT","圣文森特和格林纳丁斯"], ["LKA","斯里兰卡"],
  ["SVK","斯洛伐克"], ["SVN","斯洛文尼亚"], ["SWZ","斯威士兰"], ["SUR","苏里南"], ["SLB","所罗门群岛"],
  ["TJK","塔吉克斯坦"], ["TWN","台湾"], ["THA","泰国"], ["TZA","坦桑尼亚"], ["TON","汤加"],
  ["TCA","特克斯和凯科斯群岛"], ["TTO","特立尼达和多巴哥"], ["TUN","突尼斯"], ["TUR","土耳其"], ["TKM","土库曼斯坦"],
  ["VUT","瓦努阿图"], ["GTM","危地马拉"], ["VEN","委内瑞拉"], ["BRN","文莱"], ["UGA","乌干达"],
  ["UKR","乌克兰"], ["URY","乌拉圭"], ["UZB","乌兹别克斯坦"], ["ESP","西班牙"], ["GRC","希腊"],
  ["HKG","香港"], ["SGP","新加坡"], ["NZL","新西兰"], ["HUN","匈牙利"], ["JAM","牙买加"],
  ["ARM","亚美尼亚"], ["YEM","也门"], ["IRQ","伊拉克"], ["ISR","以色列"], ["ITA","意大利"],
  ["IND","印度"], ["IDN","印度尼西亚"], ["GBR","英国"], ["VGB","英属维尔京群岛"], ["JOR","约旦"],
  ["VNM","越南"], ["ZMB","赞比亚"], ["TCD","乍得"], ["CHL","智利"], ["CHN","中国大陆"],
];
// 全量地区缓存（创建账号时从 Apple 页面抓取），供 -h 展示全部；缓存前回退到 COMMON_REGIONS
const REGIONS_CACHE = path.join(STATE_DIR, 'regions.json');

function parseArgs() {
  const args = process.argv.slice(2);
  // -e / -p / -n 这种需要值的 flag：取下一个 token，若缺失或又是 flag 则报错退出 —— 之前会静默把下个 flag 当成 value
  const takeArg = (flag, i) => {
    const next = args[i + 1];
    if (next === undefined || /^-/.test(next)) {
      console.error(`❌ ${flag} 需要一个参数（不能后跟另一个 flag 或省略）`);
      process.exit(2);
    }
    return next;
  };
  const opts = {
    email: null, // null 表示用户未指定 —— 由 resolveStartEmail 决定起始邮箱
    password: null, // null 表示未用 -p 指定 —— 由 resolvePassword 决定（首次提示、之后沿用）
    regions: [], // 每个账号的地区，按序对应；不足数量时用 DEFAULT_TERRITORY 补齐
    count: 1,
    logout: false,
    keepCookies: false,
  };
  let countExplicit = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-e' || a === '--email') { opts.email = takeArg(a, i); i++; }
    else if (a === '-p' || a === '--password') { opts.password = takeArg(a, i); i++; }
    else if (a === '-r' || a === '--region') {
      // 可跟多个地区，遇到下一个 flag 或纯数字（留给数量）即停止
      while (i + 1 < args.length && !/^-/.test(args[i + 1]) && !/^\d+$/.test(args[i + 1])) {
        opts.regions.push(args[++i].toUpperCase());
      }
    } else if (a === '-n' || a === '--count') {
      const raw = takeArg(a, i); i++;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n) || n < 1) {
        console.error(`❌ ${a} 需要正整数，收到: ${raw}`);
        process.exit(2);
      }
      opts.count = n;
      countExplicit = true;
    } else if (/^\d+$/.test(a)) {
      opts.count = parseInt(a, 10) || 1; // 裸数字 = 创建数量
      countExplicit = true;
    } else if (a === '--logout' || a === '--switch-account') {
      opts.logout = true;
    } else if (a === '--keep-cookies' || a === '--keep') {
      opts.keepCookies = true;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (a === '--version' || a === '-v') {
      // 用 require 走脚本同目录的 package.json（与 trampoline 安装到 STATE_DIR 的依赖 package.json 区分）
      console.log(require('./package.json').version);
      process.exit(0);
    } else {
      console.error(`❌ 未知参数: ${a}（用 -h 查看支持的参数）`);
      process.exit(2);
    }
  }
  // 未显式给数量但给了多个地区时，数量取地区数（如 `-r CHN USA JPN` 建 3 个）
  if (!countExplicit && opts.regions.length > 0) opts.count = opts.regions.length;
  if (opts.count < 1) opts.count = 1;
  return opts;
}

function printHelp() {
  let regions = FALLBACK_REGIONS;
  let regionNote = `（共 ${FALLBACK_REGIONS.length} 个，脚本内置；运行一次创建会自动同步 Apple 最新列表）`;
  try {
    const cached = JSON.parse(fs.readFileSync(REGIONS_CACHE, 'utf8'));
    if (Array.isArray(cached) && cached.length > 0) {
      regions = cached;
      regionNote = `（共 ${cached.length} 个，数据来自 Apple 页面；传错会自动列出可选项）`;
    }
  } catch {}
  const regionLines = [];
  for (let i = 0; i < regions.length; i += 5) {
    regionLines.push('  ' + regions.slice(i, i + 5).map(([c, n]) => `${c} ${n}`).join('   '));
  }
  console.log(`
沙盒测试账号自动创建工具

用法:
  sandbox-tester [数量] [-e EMAIL] [-p PASSWORD] [-r 地区...] [-n N]

参数:
  数量                   要创建几个账号，裸数字直接传，等价于 -n      (默认: 1)
  -n, --count N         要创建几个账号                              (默认: 1)
  -e, --email EMAIL     起始邮箱，被占用会自动末尾数字 +1 递增。
                        不传则从「上次成功的邮箱 +1」开始；首次会提示你设置起始邮箱
  -p, --password PASS   密码；首次会提示设置默认密码，之后沿用（可随时使用 -p 指定密码，此操作不会修改默认密码）
  -r, --region CODE...  地区 ISO-3 码，可传多个分别对应每个账号；
                        不足数量的部分用 ${DEFAULT_TERRITORY} 补齐         (默认: ${DEFAULT_TERRITORY})
  --logout              退出当前登录账号（默认清 cookie，下次登录需 2FA）
  --keep-cookies        搭配 --logout：保留 cookie + 设备信任，下次登录免 2FA
  -h, --help            显示本帮助
  -v, --version         显示版本号

示例:
  sandbox-tester                       从上次成功邮箱 +1 建 1 个（美国）
  sandbox-tester 3                     连续建 3 个（都美国）
  sandbox-tester 3 -r CHN USA JPN      建 3 个，地区分别 中国/美国/日本
  sandbox-tester -r CHN USA JPN        同上（数量自动取地区数）
  sandbox-tester 3 -r CHN              建 3 个，第 1 个中国其余美国
  sandbox-tester -e wxyz2000@test.com  指定起始邮箱建 1 个

地区代码:
${regionLines.join('\n')}
  ${regionNote}
`);
}

// 邮箱被占用时的候选列表：末尾有数字则从该数字递增（保留前导零宽度），否则追加 1/2/3... 后缀
function buildEmailCandidates(email, maxTries) {
  const [local, domain] = email.split('@');
  const candidates = [];
  const m = local.match(/^(.*?)(\d+)$/);
  if (m) {
    const base = m[1];
    const start = parseInt(m[2], 10);
    const width = m[2].length;
    for (let i = 0; i < maxTries; i++) {
      candidates.push(`${base}${String(start + i).padStart(width, '0')}@${domain}`);
    }
  } else {
    candidates.push(`${local}@${domain}`);
    for (let i = 1; i < maxTries; i++) {
      candidates.push(`${local}${i}@${domain}`);
    }
  }
  return candidates;
}

// 邮箱末尾数字 +1（保留前导零宽度）；没有数字则追加 "1"
function incrementEmail(email) {
  const [local, domain] = email.split('@');
  const m = local.match(/^(.*?)(\d+)$/);
  if (m) {
    const next = parseInt(m[2], 10) + 1;
    return `${m[1]}${String(next).padStart(m[2].length, '0')}@${domain}`;
  }
  return `${local}1@${domain}`;
}

// last-email.json 按 Apple 账号存各自的上次成功邮箱：{ "<appleId>": "<email>" }
function readLastEmail(appleId) {
  try {
    const map = JSON.parse(fs.readFileSync(LAST_EMAIL_FILE, 'utf8'));
    return map[appleId || '__unknown__'] || null;
  } catch {
    return null;
  }
}

function saveLastEmail(appleId, email) {
  let map = {};
  try {
    map = JSON.parse(fs.readFileSync(LAST_EMAIL_FILE, 'utf8'));
  } catch {}
  map[appleId || '__unknown__'] = email;
  try {
    fs.writeFileSync(LAST_EMAIL_FILE, JSON.stringify(map, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn(`⚠️ 保存 last-email 失败 (${LAST_EMAIL_FILE}): ${e.message}`);
  }
}

// 起始邮箱：-e 指定优先；否则取该账号上次成功邮箱 +1；该账号首次（或刚切换账号）则交互询问
async function resolveStartEmail(userEmail, appleId) {
  if (userEmail) return userEmail;
  const last = readLastEmail(appleId);
  if (last) return incrementEmail(last);
  console.log(`\n账号「${appleId || '当前账号'}」首次使用，请设置一个起始邮箱（之后会自动递增、不再询问）。`);
  console.log('建议用未在 Apple 注册过的测试域名，例如：wxyz1001@test.com、hu1000@test.com');
  let input = (await prompt('起始邮箱: ')).trim();
  while (!/^[^@\s]+@[^@\s]+$/.test(input)) {
    input = (await prompt('邮箱格式不对，请重新输入（如 wxyz1001@test.com）: ')).trim();
  }
  return input;
}

function isValidPassword(p) {
  return p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

function readPassword() {
  try {
    return fs.readFileSync(PASSWORD_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function savePassword(pwd) {
  // mode 0o600：明文密码不让同机其他用户读
  try {
    fs.writeFileSync(PASSWORD_FILE, pwd, { mode: 0o600 });
  } catch (e) {
    console.warn(`⚠️ 保存默认密码失败 (${PASSWORD_FILE}): ${e.message}`);
  }
}

// 默认密码：-p 指定则用它并更新默认；否则用已存的；都没有则首次交互设置（与账号无关，切换账号不重问）
async function resolvePassword(userPassword) {
  if (userPassword) {
    savePassword(userPassword);
    return userPassword;
  }
  const saved = readPassword();
  if (saved) return saved;
  console.log('\n请设置一个默认密码（之后都用它创建，除非用 -p 指定；切换账号也不会再问）。');
  console.log(`要求 >=8 位、含大小写字母和数字，例如：${DEFAULT_PASSWORD}`);
  let input = (await prompt('默认密码: ')).trim();
  while (!isValidPassword(input)) {
    input = (await prompt('不符合要求（>=8 位 + 大小写字母 + 数字），请重输: ')).trim();
  }
  savePassword(input);
  return input;
}

// 后台启动 / pipe 输入 / cron 跑这些场景下 stdin 不是 TTY，readline 会立刻 EOF resolve('')，
// 让 while (!isValid(input)) 死循环、让"按回车继续"提示瞬间通过 —— 必须早抛友好错误
class InteractiveRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InteractiveRequiredError';
  }
}

function prompt(message) {
  if (!process.stdin.isTTY) {
    throw new InteractiveRequiredError(
      '需要交互式输入但 stdin 不是终端（可能是后台启动 / pipe / cron）。\n' +
      '解决：先在前台 terminal 直接跑一次 sandbox-tester 完成首次配置（设密码 / 设起始邮箱 / 登录），\n' +
      '之后相同账号的运行（已落地配置）可以再走后台。',
    );
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function copyToClipboard(text) {
  try {
    const proc = spawn('pbcopy');
    proc.stdin.write(text);
    proc.stdin.end();
  } catch (e) {
    console.warn('剪贴板复制失败:', e.message);
  }
}

function notify(title, message) {
  try {
    const esc = (s) => String(s).replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"'`);
  } catch {}
}

// 读 macOS LaunchServices plist 拿系统默认浏览器的 bundle id
function getSystemDefaultBrowserBundle() {
  try {
    const plist = path.join(os.homedir(), 'Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist');
    const out = execSync(`plutil -convert json -o - "${plist}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const data = JSON.parse(out);
    const handlers = data.LSHandlers || [];
    const findScheme = (scheme) => {
      for (const h of handlers) {
        if (h.LSHandlerURLScheme === scheme && h.LSHandlerRoleAll) return h.LSHandlerRoleAll.toLowerCase();
      }
      return null;
    };
    return findScheme('https') || findScheme('http');
  } catch {
    return null;
  }
}

// bundle id → Playwright channel；非 Chromium 系（Safari/Firefox/Brave/Arc 等）返回 null
function bundleToPlaywrightChannel(bundle) {
  if (bundle === 'com.google.chrome') return 'chrome';
  if (bundle === 'com.microsoft.edgemac') return 'msedge';
  return null;
}

// Playwright 仅支持驱动 Chromium 系（Chrome/Edge 都走 CDP），Safari/Firefox 走 WebDriver 不支持
// 选哪个：① 沿用上次保存的 channel（首要：profile 兼容、不丢登录态）
//        ② 已有 profile + Edge 装了 → 视为老 Edge 用户继续 Edge
//        ③ 系统默认浏览器（如果是 Chrome/Edge 且装了）
//        ④ 兜底：Chrome 优先，Edge 兜底
function pickChromiumChannel() {
  const chromeOk = fs.existsSync('/Applications/Google Chrome.app');
  const edgeOk = fs.existsSync('/Applications/Microsoft Edge.app');
  if (!chromeOk && !edgeOk) {
    throw new Error('未检测到 Chrome 或 Edge，请安装其中一个（脚本不支持驱动 Safari）');
  }
  try {
    const saved = fs.readFileSync(CHANNEL_FILE, 'utf8').trim();
    if (saved === 'chrome' && chromeOk) return 'chrome';
    if (saved === 'msedge' && edgeOk) return 'msedge';
  } catch {}
  if (edgeOk && fs.existsSync(USER_DATA_DIR)) {
    try {
      if (fs.readdirSync(USER_DATA_DIR).length > 0) {
        try { fs.writeFileSync(CHANNEL_FILE, 'msedge'); } catch {}
        return 'msedge';
      }
    } catch {}
  }
  const fromDefault = bundleToPlaywrightChannel(getSystemDefaultBrowserBundle());
  if (fromDefault) {
    const ok = fromDefault === 'chrome' ? chromeOk : edgeOk;
    if (ok) {
      try { fs.writeFileSync(CHANNEL_FILE, fromDefault); } catch {}
      return fromDefault;
    }
  }
  const chosen = chromeOk ? 'chrome' : 'msedge';
  try { fs.writeFileSync(CHANNEL_FILE, chosen); } catch {}
  return chosen;
}

async function isLoggedIn(page) {
  const url = page.url();
  if (url.includes('idmsa.apple.com') || url.includes('appleid.apple.com')) return false;
  if (/\/(signin|login|auth)(\b|\?|#|\/)/i.test(url)) return false;
  const loginFormHit = await page
    .locator('input[type="password"], input[name="account_name"], input[autocomplete="username"]')
    .count()
    .catch(() => 0);
  if (loginFormHit > 0) return false;
  return url.includes('appstoreconnect.apple.com');
}

async function getCurrentAppleId(page) {
  // 优先：调 App Store Connect 的 session API 拿真实登录账号
  // 避免直接搜 DOM —— sandbox 列表表格里有其他账号的邮箱，全文匹配会误抓
  try {
    const data = await page.evaluate(async () => {
      try {
        const r = await fetch('/olympus/v1/session', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    });
    if (data) {
      const found = (function find(o, d) {
        if (d > 5 || !o) return null;
        if (typeof o === 'string' && /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(o)) return o;
        if (typeof o === 'object') {
          for (const k of ['emailAddress', 'email', 'userName', 'username']) {
            if (typeof o[k] === 'string' && /@/.test(o[k])) return o[k];
          }
          for (const v of Object.values(o)) {
            const f = find(v, d + 1);
            if (f) return f;
          }
        }
        return null;
      })(data, 0);
      if (found) return found;
    }
  } catch {}

  // 兜底：限定在 header 用户菜单元素内查（不全局搜 body 避免抓表格里的邮箱）
  const userMenuSelectors = [
    '[data-testid*="user-menu" i]',
    '[aria-label*="account" i]',
    'header [class*="userMenu" i]',
    'nav [aria-haspopup="true"]',
  ];
  for (const sel of userMenuSelectors) {
    try {
      const text = await page.locator(sel).first().innerText({ timeout: 1000 }).catch(() => '');
      const match = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
      if (match) return match[0];
    } catch {}
  }
  return null;
}

async function clickFirstVisible(page, selectors, description) {
  for (const sel of selectors) {
    const loc = typeof sel === 'string' ? page.locator(sel).first() : sel;
    try {
      if (await loc.isVisible({ timeout: 1000 })) {
        await loc.click();
        return sel;
      }
    } catch {}
  }
  throw new Error(`找不到「${description}」对应的元素，Apple 可能改版了 selector`);
}

async function dumpErrorState(page, label) {
  try {
    const stamp = Date.now();
    const file = `/tmp/sandbox-${label}-${stamp}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.error(`📸 当前页面截图: ${file}`);
  } catch {}
}

// 软退出：清账号会话 cookie 但保留 .idmsa.apple.com 的 DES* 设备信任，让下次登录免 2FA
async function softLogout() {
  if (!fs.existsSync(USER_DATA_DIR)) return false;
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: pickChromiumChannel(),
    headless: true,
    ignoreDefaultArgs: ['--no-sandbox', '--enable-automation'],
    chromiumSandbox: true,
  });
  if (fs.existsSync(STORAGE_STATE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf8'));
      if (Array.isArray(saved.cookies) && saved.cookies.length > 0) {
        await context.addCookies(saved.cookies);
      }
    } catch {}
  }
  // 清账号会话相关 cookie；保留 .idmsa.apple.com 上的 DES* 设备信任（下次登录免 2FA）
  const SESSION_COOKIES = ['myacinfo', 'itctx', 'dqsid', 'wosid', 'woinst', 'aasp', 'aa'];
  const failedCookies = [];
  for (const name of SESSION_COOKIES) {
    try { await context.clearCookies({ name }); } catch { failedCookies.push(name); }
  }
  if (failedCookies.length > 0) {
    console.warn(`⚠️ 以下 session cookie 清除失败（Apple 可能改了 cookie 命名）: ${failedCookies.join(', ')}`);
  }
  await context.storageState({ path: STORAGE_STATE });
  try { fs.chmodSync(STORAGE_STATE, 0o600); } catch {}
  await context.close();
  return true;
}

// 创建单个沙盒账号；startEmail 被占用时自动递增。返回实际使用的 { email, regionDisplay }
async function createOneSandbox(page, startEmail, region, password) {
  console.log('  点击「添加测试人员」按钮 ...');
  await clickFirstVisible(
    page,
    [
      'button[aria-label*="Add" i]',
      'button[aria-label*="添加" i]',
      'button:has-text("添加")',
      'button:has-text("Add Tester")',
      'button:has-text("Add")',
      '[data-testid*="add" i]',
    ],
    '添加测试人员按钮',
  );
  await page.waitForTimeout(1500);

  await page.getByLabel(/First Name|名字|名/i).first().fill('Test');
  await page.getByLabel(/Last Name|姓氏|姓/i).first().fill('User');

  // 邮箱：被占用时自动把末尾数字 +1 重填，直到找到可用的（最多 MAX_EMAIL_TRIES 次）
  const emailField = page.getByLabel(/^Email|^邮箱|电子邮件/i).first();
  const candidates = buildEmailCandidates(startEmail, MAX_EMAIL_TRIES);
  let chosenEmail = null;
  for (const candidate of candidates) {
    await emailField.fill(candidate);
    await emailField.blur().catch(() => {});
    await page.waitForTimeout(900);
    const taken = await page
      .getByText(/not available|already have an Apple|无法使用|已被使用/i)
      .first()
      .count()
      .catch(() => 0);
    if (taken === 0) {
      chosenEmail = candidate;
      break;
    }
    console.log(`    ⚠️ ${candidate} 已占用，尝试下一个 ...`);
  }
  if (!chosenEmail) {
    throw new Error(
      `连续 ${candidates.length} 个邮箱都被占用（${candidates[0]} ~ ${candidates[candidates.length - 1]}），请换个前缀重试`,
    );
  }
  console.log(`  ✅ 使用邮箱: ${chosenEmail}`);

  const pwdInputs = page.locator('input[type="password"]');
  const pwdCount = await pwdInputs.count();
  if (pwdCount >= 2) {
    await pwdInputs.nth(0).fill(password);
    await pwdInputs.nth(1).fill(password);
  } else if (pwdCount === 1) {
    await pwdInputs.nth(0).fill(password);
  } else {
    throw new Error('找不到密码输入框');
  }

  // 「国家或地区」是原生 select 但未关联 label，用 data-testid 直接定位；option value 为 ISO alpha-3（USA/CHN/JPN）
  const territorySelect = page
    .locator('select[data-testid="select-country-region"], select[name="storeFront"]')
    .first();
  if ((await territorySelect.count()) === 0) {
    throw new Error('找不到「国家或地区」下拉框');
  }
  // 顺手缓存全量地区供 -h 展示（来自 Apple 当前页面，自动保持最新）
  try {
    const allRegions = await territorySelect.evaluate((sel) =>
      Array.from(sel.options).filter((o) => o.value).map((o) => [o.value, o.textContent.trim()]),
    );
    if (allRegions.length > 0) fs.writeFileSync(REGIONS_CACHE, JSON.stringify(allRegions));
  } catch {}
  let regionLabel = '';
  try {
    await territorySelect.selectOption(region);
    regionLabel = await territorySelect.evaluate((sel) => {
      const opt = sel.options[sel.selectedIndex];
      return opt ? opt.textContent.trim() : '';
    });
  } catch {
    const options = await territorySelect.evaluate((sel) =>
      Array.from(sel.options).map((o) => `${o.value}=${o.textContent.trim()}`),
    );
    throw new Error(
      `地区 "${region}" 未匹配到下拉项（value 用 ISO alpha-3，如 USA / CHN / JPN）。\n可选项示例:\n${options.slice(0, 8).join('\n')}\n...(共 ${options.length} 个)`,
    );
  }
  const regionDisplay = regionLabel ? `${region}(${regionLabel})` : region;

  await page.waitForTimeout(500);
  console.log('  提交 ...');
  await clickFirstVisible(
    page,
    [
      'button:has-text("Create")',
      'button:has-text("创建")',
      'button:has-text("Save")',
      'button:has-text("保存")',
      'button[type="submit"]',
    ],
    '创建按钮',
  );

  await page.waitForTimeout(4000);

  const errorLoc = page.locator('[role="alert"], [class*="error" i]:visible').first();
  if ((await errorLoc.count()) > 0) {
    const errorMsg = (await errorLoc.innerText().catch(() => '')).trim();
    if (errorMsg) {
      await dumpErrorState(page, 'submit-error');
      throw new Error(`Apple 返回错误: ${errorMsg}`);
    }
  }

  return { email: chosenEmail, regionDisplay };
}

async function main() {
  const opts = parseArgs();

  if (opts.logout) {
    if (!fs.existsSync(USER_DATA_DIR)) {
      console.log('未发现登录态，无需退出');
      return;
    }
    if (opts.keepCookies) {
      await softLogout();
      console.log('✅ 已退出登录账号（保留 cookie + 设备信任，下次登录免 2FA）');
    } else {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
      console.log('✅ 已退出登录账号并清除 cookie（下次登录需 2FA；各账号邮箱进度仍保留）');
    }
    return;
  }

  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  // 锁权限：STATE_DIR 下有明文密码 / Apple 登录 cookie，禁止其他系统用户读取
  try { fs.chmodSync(STATE_DIR, 0o700); } catch {}
  // 兼容老用户：把历史已存在的敏感文件一次性 chmod 600（之前默认 0644 任何用户可读）
  for (const f of [PASSWORD_FILE, LAST_EMAIL_FILE, STORAGE_STATE]) {
    if (fs.existsSync(f)) { try { fs.chmodSync(f, 0o600); } catch {} }
  }
  opts.password = await resolvePassword(opts.password);
  console.log(`登录态目录: ${USER_DATA_DIR}`);

  let context;
  let closed = false;
  const gracefulClose = async () => {
    if (closed || !context) return;
    closed = true;
    try {
      await context.storageState({ path: STORAGE_STATE });
      try { fs.chmodSync(STORAGE_STATE, 0o600); } catch {}
      await context.close();
      console.log('\n已保存登录态');
    } catch {}
  };
  process.on('SIGINT', async () => {
    console.log('\n收到 Ctrl+C，正在保存登录态后退出 ...');
    await gracefulClose();
    process.exit(130);
  });
  process.on('SIGTERM', async () => {
    await gracefulClose();
    process.exit(143);
  });

  // 打开 sandbox 页：headless=true 全程无窗口、用户无感；仅在需要登录时以 headless=false 重开供操作
  const openSandbox = async (headless) => {
    if (context) {
      try {
        await context.storageState({ path: STORAGE_STATE });
        try { fs.chmodSync(STORAGE_STATE, 0o600); } catch {}
      } catch {}
      await context.close().catch(() => {});
    }
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      channel: pickChromiumChannel(),
      headless,
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ['--no-sandbox', '--enable-automation'],
      chromiumSandbox: true,
    });
    if (fs.existsSync(STORAGE_STATE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf8'));
        if (Array.isArray(saved.cookies) && saved.cookies.length > 0) {
          await context.addCookies(saved.cookies);
        }
      } catch {}
    }
    const p = context.pages()[0] || (await context.newPage());
    await p.goto(SANDBOX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    return p;
  };

  let page;
  try {
    console.log('后台静默打开 App Store Connect（无窗口）...');
    page = await openSandbox(true);

    if (!(await isLoggedIn(page))) {
      console.log('\n⚠️  未检测到登录态，打开浏览器窗口供登录 ...');
      page = await openSandbox(false);
      if (!(await isLoggedIn(page))) {
        console.log('请在窗口完成 Apple ID 登录 + 2FA，登录完成后回车继续...');
        await prompt('');
        await page.goto(SANDBOX_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        if (!(await isLoggedIn(page))) {
          throw new Error('仍未检测到登录态，请手动确认登录状态后重试');
        }
      }
    }

    const appleId = await getCurrentAppleId(page);
    console.log(
      appleId
        ? `✅ 已登录: ${appleId}，将在此账号下创建沙盒账号`
        : '✅ 已登录，将在当前账号下创建沙盒账号',
    );

    // 起始邮箱按当前账号解析：换了账号 / 该账号首次 → 重新提示输入
    let startEmail = await resolveStartEmail(opts.email, appleId);

    const planRegions = [];
    for (let i = 0; i < opts.count; i++) planRegions.push(opts.regions[i] || DEFAULT_TERRITORY);
    console.log('\n沙盒账号配置:');
    console.log(`  起始邮箱: ${startEmail}${opts.email ? '' : '（按账号自动接续）'}`);
    console.log(`  密码:     ${opts.password}`);
    console.log(`  地区:     ${planRegions.join(', ')}`);
    console.log(`  数量:     ${opts.count}`);

    const created = [];
    for (let i = 0; i < opts.count; i++) {
      const region = opts.regions[i] || DEFAULT_TERRITORY;
      console.log(`\n=== 创建第 ${i + 1}/${opts.count} 个账号（${region}，起始 ${startEmail}）===`);
      try {
        const result = await createOneSandbox(page, startEmail, region, opts.password);
        created.push(result);
        saveLastEmail(appleId, result.email);
        startEmail = incrementEmail(result.email);
      } catch (err) {
        console.error(`\n❌ 第 ${i + 1} 个创建失败: ${err.message}`);
        await dumpErrorState(page, 'fail');
        break;
      }
    }

    if (created.length === 0) {
      throw new Error('没有成功创建任何账号');
    }

    console.log(`\n✅ 成功创建 ${created.length}/${opts.count} 个沙盒账号:`);
    created.forEach((c) => console.log(`   ${c.email}  |  ${opts.password}  |  ${c.regionDisplay}`));

    const clipboard = created
      .map((c) => `邮箱: ${c.email}\n密码: ${opts.password}\n地区: ${c.regionDisplay}`)
      .join('\n\n');
    copyToClipboard(clipboard);
    console.log('📋 账号信息已复制到剪贴板');
    notify('沙盒账号已创建', created.length === 1 ? created[0].email : `${created.length} 个账号`);
  } catch (err) {
    if (err instanceof InteractiveRequiredError) {
      console.error(`\n❌ ${err.message}`);
      process.exitCode = 2;
    } else {
      console.error(`\n❌ ${err.message}`);
      await dumpErrorState(page, 'fail');
      console.error('如果是 selector 不匹配（Apple 改版），把 /tmp 下的截图发给开发者更新脚本');
      process.exitCode = 1;
    }
  } finally {
    await gracefulClose();
  }
}

main().catch((e) => {
  if (e instanceof InteractiveRequiredError) {
    console.error(`\n❌ ${e.message}`);
    process.exit(2);
  }
  console.error(e);
  process.exit(1);
});
