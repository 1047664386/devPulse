/**
 * 生成稳定的设备指纹（Device Fingerprint）
 *
 * 设计原则：只采集不受窗口缩放、页面操作、网络切换影响的硬件/浏览器底层特征。
 * 同一浏览器多次运行产生相同指纹，不同浏览器（即使在同一台机器上）产生不同指纹。
 *
 * ── 已采集的稳定维度 ──────────────────────────────────────────
 *  ① navigator.userAgent         — 浏览器内核 + 版本号（同版本恒定）
 *  ② screen.width × screen.height — 物理屏幕分辨率（外接显示器不变）
 *  ③ screen.colorDepth            — 色深（硬件固定）
 *  ④ timeZone                     — 系统时区名（地区不变则固定）
 *  ⑤ navigator.maxTouchPoints     — 最大触控点数（区分触控/非触控设备）
 *  ⑥ navigator.hardwareConcurrency — CPU 逻辑核心数（硬件固定）
 *  ⑦ navigator.languages          — 浏览器语言偏好列表（系统级设置）
 *
 * ── 刻意剔除的易变字段 ────────────────────────────────────────
 *  ✗ window.innerWidth / innerHeight — 缩放/调整窗口即变
 *  ✗ window.outerWidth / outerHeight — 同上
 *  ✗ screen.availWidth / availHeight — 受任务栏/菜单栏影响，不同 OS 表现不一致
 *  ✗ devicePixelRatio                — 缩放比例改变时跟随变化（如 100% ↔ 150%）
 *  ✗ IP 地址                         — 切 WiFi / 切流量 / VPN 开关都会变
 *                                    → IP 仅作为展示信息存入会话，不参与指纹计算
 *  ✗ Canvas / WebGL 指纹             — 需要异步 DOM 渲染，无痕模式下降级严重，
 *                                    部分浏览器会弹隐私警告，社区平台投入产出比低
 *
 * 哈希算法：FNV-1a 32-bit，输出 8 位十六进制字符串。
 * 零外部依赖，毫秒级同步计算，适合前端登录/注册流程同步调用。
 *
 * 已知局限（可接受的 trade-off）：
 *  - 浏览器大版本更新后 UA 改变 → 指纹变化 → 视为新设备（用户无感知）
 *  - 无痕/隐私模式下部分属性可能缺失 → 产生独立会话（安全侧保守策略）
 *  - 更换外接显示器 → screen 分辨率变化 → 视为新设备（极少发生）
 */
export function getDeviceFingerprint(): string {
  const nav = navigator;

  // 按固定顺序拼接稳定特征，顺序变化会导致哈希不同，不可调整
  const parts = [
    nav.userAgent,                                // ① 浏览器内核
    String(screen.width),                         // ② 屏幕宽
    String(screen.height),                        // ② 屏幕高
    String(screen.colorDepth),                    // ③ 色深
    Intl.DateTimeFormat().resolvedOptions().timeZone, // ④ 时区名
    String(nav.maxTouchPoints),                   // ⑤ 触控点
    String(nav.hardwareConcurrency ?? 0),         // ⑥ CPU 核心数
    nav.languages.join(','),                      // ⑦ 语言列表
  ];

  const raw = parts.join('|');

  // FNV-1a 32-bit hash — 快速、均匀分布、零依赖
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // 无符号右移 → 8 位十六进制（不足 8 位前补零）
  return (hash >>> 0).toString(16).padStart(8, '0');
}
